# DEADCODE.md

Whenever code that was present in base Wikidot is removed from the repository,
make a note of it here. Record where it was, what it did, and why it was
removed.

If possible, add to this log in the same commit in which the code is removed.

## PHP: SimpleToDo module
* Relevant Issues: [WDBUGS-219](https://scuttle.atlassian.net/browse/WDBUGS-219)
* Where it was: [SimpletodoListBase.php](https://github.com/scpwiki/wikijump/blob/439c92376f04adaf73af87e2f53edabced8ca90f/php/db/base/DB/SimpletodoListBase.php), [SimpletodoListPeerBase.php](https://github.com/scpwiki/wikijump/blob/439c92376f04adaf73af87e2f53edabced8ca90f/php/db/base/DB/SimpletodoListPeerBase.php), [SimpleToDoModule.js](https://github.com/scpwiki/wikijump/blob/439c92376f04adaf73af87e2f53edabced8ca90f/web/files--common/modules/js/simpletodo/SimpleToDoModule.js)
* What it did: The `SimpleToDo` module usable in Wikitext, which provides a primitive editable list. See [Wikidot's documentation](https://www.wikidot.com/doc:simpletodo-module).
* Why it was removed: This feature is not used in real applications, is not a very well-designed UI for its task, and represents an unnecessary code maintenance burden.

## PHP: UnixifyString
* Relevant Issues: [WDBUGS-236](https://scuttle.atlassian.net/browse/WDBUGS-236)
* Where it was: [UnixifyString](https://github.com/scpwiki/wikijump/blob/571cd42cb810223a5dfe5f594b66adc39cb5295e/web/php/utils/Wikijump/Util/UnixifyString.php), [Unixify](https://github.com/scpwiki/wikijump/blob/571cd42cb810223a5dfe5f594b66adc39cb5295e/web/php/quickmodules/Unixify.php)
* What it did: It duplicated the code found in `WDStringUtils`, with some minor changes.
* Why it was removed: It was unused.