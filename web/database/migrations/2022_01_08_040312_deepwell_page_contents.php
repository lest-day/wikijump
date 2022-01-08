<?php
declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

function addString(string $value): string
{
    $hash = hash('sha512', $value, true);
    $entry = DB::table('strings')
        ->where('hash', $hash)
        ->first();

    if (!$entry) {
        DB::table('strings')->insert([
            'hash' => $hash,
            'contents' => $value,
        ]);
    }

    return $hash;
}

class DeepwellPageContents extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // This hands ownership of these tables to DEEPWELL
        // It migrates the contents to the new table

        DB::statement("
            -- No unique constraint because that creates a separate index,
            -- which will impact performance. Instead we add a CHECK constraint.
            CREATE TABLE strings (
                hash BYTEA PRIMARY KEY,
                contents TEXT NOT NULL,

                CHECK (hash = digest(contents, 'sha512'))
            )
        ");

        Schema::table('page_revision', function (Blueprint $table) {
            $table->binary('wikitext_hash')->references('hash')->on('strings')->nullable();
            $table->binary('compiled_hash')->references('hash')->on('strings')->nullable();
            $table->text('compiled_generator')->nullable();
        });

        // Migrate existing sources
        $contents_list = DB::table('page_contents')
            ->select('revision_id', 'wikitext', 'compiled_html', 'generator')
            ->get()
            ->toArray();

        foreach ($contents_list as $contents) {
            $wikitext_hash = addString($contents->wikitext);
            $compiled_hash = addString($contents->compiled_html);

            DB::table('page_revision')
                ->where('revision_id', $contents->revision_id)
                ->update([
                    'wikitext_hash' => $wikitext_hash,
                    'compiled_hash' => $compiled_hash,
                    'compiled_generator' => $contents->generator,
                ]);
        }

        // Remove temporary non-null status
        Schema::table('page_revision', function (Blueprint $table) {
            $table->binary('wikitext_hash')->nullable(false)->change();
            $table->binary('compiled_hash')->nullable(false)->change();
            $table->text('compiled_generator')->nullable(false)->change();
        });

        Schema::drop('page_contents');
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::create('page_contents', function (Blueprint $table) {
            $table->timestamps();
            $table->foreignId('revision_id');
            $table->longtext('wikitext');
            $table->longtext('compiled_html');
            $table->string('generator', 64);

            $table->foreign('revision_id')->references('revision_id')->on('page_revision');
            $table->primary('revision_id');
        });

        Schema::table('page_revision', function (Blueprint $table) {
            $table->dropColumn('wikitext_hash');
            $table->dropColumn('compiled_hash');
            $table->dropColumn('compiled_generator');
        });
    }
}
