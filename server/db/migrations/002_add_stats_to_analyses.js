exports.up = async (knex) => {
  await knex.schema.alterTable('analyses', (t) => {
    t.text('stats_data_json');
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('analyses', (t) => {
    t.dropColumn('stats_data_json');
  });
};
