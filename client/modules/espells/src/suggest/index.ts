import iterate from "iterare"
import type { Aff } from "../aff"
import { CapType, CONSTANTS as C } from "../constants"
import type { Dic } from "../dic"
import type { Word } from "../dic/word"
import type { Lookup } from "../lookup"
import {
  badchar,
  badcharkey,
  doubletwochars,
  extrachar,
  forgotchar,
  longswapchar,
  mapchars,
  movechar,
  replchars,
  swapchar,
  twowords
} from "../permutations"
import { intersect, lowercase, uppercase } from "../util"
import { NgramSuggestionBuilder } from "./ngram"
import { PhonetSuggestionBuilder } from "./phonet"
import { MultiWordSuggestion, Suggestion } from "./suggestion"

type Handler = (
  suggestion: Suggestion,
  checkInclusion?: boolean
) => Suggestion | undefined

export class Suggest {
  private declare aff: Aff
  private declare dic: Dic
  private declare lookup: Lookup
  private declare ngramWords: Set<Word>
  private declare dashes: boolean

  constructor(aff: Aff, dic: Dic, lookup: Lookup) {
    this.aff = aff
    this.dic = dic
    this.lookup = lookup

    const badFlags = iterate([aff.FORBIDDENWORD, aff.NOSUGGEST, aff.ONLYINCOMPOUND])
      .filter(flag => Boolean(flag))
      .toSet()

    this.ngramWords = iterate(dic.words)
      .filter(word => (!word.flags ? true : intersect(word.flags, badFlags).size === 0))
      .toSet()

    // TODO: fix this - this is dumb but this is legit how Hunspell does it
    this.dashes = aff.TRY.includes("-") || aff.TRY.includes("a")
  }

  *suggestions(word: string): Iterable<Suggestion> {
    const handled = new Set<string>()

    const [captype, ...variants] = this.aff.casing.corrections(word)

    const handle: Handler = (suggestion: Suggestion, checkInclusion = false) =>
      this.handle(word, captype, handled, suggestion, checkInclusion)

    if (this.aff.FORCEUCASE && captype === CapType.NO) {
      for (const capitalized of this.aff.casing.capitalize(word)) {
        if (this.correct(capitalized)) {
          const suggestion = handle(new Suggestion(capitalized, "forceucase"))
          if (suggestion) yield suggestion
          return
        }
      }
    }

    let goodEditsFound = false

    for (let idx = 0; idx < variants.length; idx++) {
      const variant = variants[idx]

      if (idx > 0 && this.correct(variant)) {
        const suggestion = handle(new Suggestion(variant, "case"))
        if (suggestion) yield suggestion
      }

      let noCompound = false

      for (const suggestion of this.edits(variant, handle, C.MAX_SUGGESTIONS)) {
        yield suggestion

        goodEditsFound ||= C.GOOD_EDITS.includes(suggestion.kind)

        // prettier-ignore
        switch(suggestion.kind) {
          case "uppercase":
          case "replchars":
          case "mapchars": {
            noCompound = true
            break
          }
          case "spaceword": return
        }
      }

      if (!noCompound) {
        for (const suggestion of this.edits(word, handle, this.aff.MAXCPDSUGS, true)) {
          yield suggestion
          goodEditsFound ||= C.GOOD_EDITS.includes(suggestion.kind)
        }
      }

      if (goodEditsFound) return

      if (word.includes("-") && !iterate(handled).some(word => word.includes("-"))) {
        const chunks = word.split("-")

        for (let idx = 0; idx < chunks.length; idx++) {
          const chunk = chunks[idx]
          if (!this.correct(chunk)) {
            for (const suggestion of this.suggestions(chunk)) {
              const candidate = [
                ...chunks.slice(0, idx),
                suggestion.text,
                ...chunks.slice(idx + 1)
              ].join("-")
              if (this.lookup.check(candidate)) yield new Suggestion(candidate, "dashes")
            }
          }
        }
      }

      if (this.aff.MAXNGRAMSUGS || this.aff.PHONE) {
        const ngram = this.aff.MAXNGRAMSUGS ? this.ngramBuilder(word, handled) : null
        const phonet = this.aff.PHONE ? this.phonetBuilder(word) : null

        for (const word of this.ngramWords) {
          if (ngram) ngram.step(word)
          if (phonet) phonet.step(word)
        }

        if (ngram) {
          yield* iterate(ngram.finish())
            .take(this.aff.MAXNGRAMSUGS)
            .map(suggestion => handle(new Suggestion(suggestion, "ngram"), true)!)
            .filter(suggestion => suggestion !== undefined)
        }

        if (phonet) {
          yield* iterate(phonet.finish())
            .take(C.MAX_PHONET_SUGGESTIONS)
            .map(suggestion => handle(new Suggestion(suggestion, "phonet"))!)
            .filter(suggestion => suggestion !== undefined)
        }
      }
    }
  }

  private *edits(word: string, handle: Handler, limit: number, compounds?: boolean) {
    yield* iterate(this.filter(this.permutations(word), compounds))
      .map(suggestion => handle(suggestion)!)
      .filter(suggestion => suggestion !== undefined)
      .take(limit)
  }

  private *filter(
    suggestions: Iterable<Suggestion | MultiWordSuggestion>,
    compounds?: boolean
  ) {
    for (const suggestion of suggestions) {
      if (suggestion instanceof MultiWordSuggestion) {
        if (suggestion.words.every(word => this.correct(word, compounds))) {
          yield suggestion.stringify()
          if (suggestion.allowDash) yield suggestion.stringify("-")
        }
      } else if (this.correct(suggestion.text, compounds)) {
        yield suggestion
      }
    }
  }

  // -- MISC.

  private handle(
    word: string,
    captype: CapType,
    handled: Set<string>,
    suggestion: Suggestion,
    checkInclusion = false
  ) {
    let text = suggestion.text

    if (!this.dic.hasFlag(text, this.aff.KEEPCASE) || this.aff.isSharps(text)) {
      text = this.aff.casing.coerce(text, captype)
      // revert if forbidden
      if (text !== suggestion.text && this.lookup.isForbidden(text)) {
        text = suggestion.text
      }

      if (captype === CapType.HUH || captype === CapType.HUHINIT) {
        const pos = text.indexOf(" ")
        if (pos !== -1) {
          if (text[pos + 1] !== word[pos] && uppercase(text[pos + 1]) === word[pos]) {
            text = text.slice(0, pos + 1) + word[pos] + word.slice(pos + 2)
          }
        }
      }
    }

    if (this.lookup.isForbidden(text)) return

    if (this.aff.OCONV) text = this.aff.OCONV.match(text)

    if (handled.has(text)) return

    if (
      checkInclusion &&
      iterate(handled).some(prev => lowercase(text).includes(lowercase(prev)))
    ) {
      return
    }

    handled.add(text)

    return suggestion.replace(text)
  }

  private *permutations(word: string): Iterable<Suggestion | MultiWordSuggestion> {
    yield new Suggestion(this.aff.casing.upper(word), "uppercase")

    for (const suggestion of replchars(word, this.aff.REP)) {
      if (Array.isArray(suggestion)) {
        yield new Suggestion(suggestion.join(" "), "replchars")
        yield new MultiWordSuggestion(suggestion, "replchars", false)
      } else {
        yield new Suggestion(suggestion, "replchars")
      }
    }

    for (const words of twowords(word)) {
      yield new Suggestion(words.join(" "), "spaceword")
      if (this.dashes) yield new Suggestion(words.join("-"), "spaceword")
    }

    yield* this.pmtFrom(mapchars(word, this.aff.MAP), "mapchars")

    yield* this.pmtFrom(swapchar(word), "swapchar")

    yield* this.pmtFrom(longswapchar(word), "longswapchar")

    yield* this.pmtFrom(badcharkey(word, this.aff.KEY), "badcharkey")

    yield* this.pmtFrom(extrachar(word), "extrachar")

    yield* this.pmtFrom(forgotchar(word, this.aff.TRY), "forgotchar")

    yield* this.pmtFrom(movechar(word), "movechar")

    yield* this.pmtFrom(badchar(word, this.aff.TRY), "badchar")

    yield* this.pmtFrom(doubletwochars(word), "doubletwochars")

    if (!this.aff.NOSPLITSUGS) {
      for (const suggestionPair of twowords(word)) {
        yield new MultiWordSuggestion(suggestionPair, "twowords", this.dashes)
      }
    }
  }

  // -- UTILITY

  private correct(word: string, compounds?: boolean) {
    return this.lookup.correct(word, {
      caps: false,
      allowNoSuggest: false,
      affixForms: !compounds,
      compoundForms: compounds
    })
  }

  private *pmtFrom(iter: Iterable<string>, name: string) {
    for (const suggestion of iter) {
      yield new Suggestion(suggestion, name)
    }
  }

  private ngramBuilder(word: string, handled: Set<string>) {
    return new NgramSuggestionBuilder(
      lowercase(word),
      this.aff.PFX,
      this.aff.SFX,
      iterate(handled).map(lowercase).toSet(),
      this.aff.MAXDIFF,
      this.aff.ONLYMAXDIFF,
      Boolean(this.aff.PHONE)
    )
  }

  private phonetBuilder(word: string) {
    return new PhonetSuggestionBuilder(word, this.aff.PHONE!)
  }
}
