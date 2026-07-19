// Inside the new migration file:
public function up()
{
    Schema::table('site_inspections', function (Blueprint $table) {
        $table->date('deadline_date')->nullable()->after('scheduled_date');
    });
}

public function down()
{
    Schema::table('site_inspections', function (Blueprint $table) {
        $table->dropColumn('deadline_date');
    });
}