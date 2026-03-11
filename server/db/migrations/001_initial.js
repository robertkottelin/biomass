/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('email').unique().notNullable();
    t.string('password_hash').notNullable();
    t.string('name');
    t.string('stripe_customer_id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('subscriptions', (t) => {
    t.increments('id').primary();
    t.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.string('stripe_subscription_id');
    t.string('plan').defaultTo('free');
    t.string('status').defaultTo('active');
    t.timestamp('current_period_end');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('forests', (t) => {
    t.increments('id').primary();
    t.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.string('name');
    t.text('polygon_geojson').notNullable();
    t.string('forest_type').defaultTo('pine');
    t.integer('forest_age');
    t.float('area_hectares');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('analyses', (t) => {
    t.increments('id').primary();
    t.integer('forest_id').references('id').inTable('forests').onDelete('CASCADE');
    t.text('ndvi_data_json');
    t.text('biomass_data_json');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('analyses');
  await knex.schema.dropTableIfExists('forests');
  await knex.schema.dropTableIfExists('subscriptions');
  await knex.schema.dropTableIfExists('users');
};
