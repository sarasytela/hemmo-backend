import uuid from 'uuid/v4';
import knex, { likeFilter, exactFilter } from '../utils/db';

export const dbGetOrganisations = (filters, employeeId, scope) => {
  const isAdmin = scope === 'admin';
  const order = filters.order === 'desc' ? 'desc' : 'asc';
  let bindings = [];
  let query;

  const select = `select o1.*, e.count as "membersTotal", sum(e.active::integer) as "membersActive" `;

  if (isAdmin) {
    query = `from organisation o1
      left join employees e on e."organisationId" = o1.id
      group by o1.id`;
  } else {
    query = `from organisation o1, organisation o2, employees e
      where e.id = '${employeeId}'
      and e."organisationId" = o2.id
      and o1."leftId" between o2."leftId" and o2."rightId"
      group by o1.id`;
  }

  // Sorting
  bindings.push(filters.orderBy || 'o2."lefId"');
  query += ` order by ? ${order}`;

  return {
    select,
    query,
    bindings,
  };
};

export const dbGetSingleOrganisation = id =>
  knex('organisation').where({ id }).returning('*').then(results => results[0]);

export const dbUpdateOrganisation = (id, fields) =>
  knex.transaction(async trx => {
    // Update row
    const unit = await trx('organisation')
      .update({
        name: fields.name,
      })
      .where({ id })
      .returning('*')
      .then(results => results[0]);

    return unit;
  });

export const dbDelOrganisation = id =>
  knex.transaction(async trx => {
    // Get unit to be deleted
    const unit = await trx('organisation')
      .select('*')
      .where({ id })
      .returning('*')
      .then(results => results[0]);

    const reduce = unit.rightId - unit.leftId + 1; // -1 is to correct result of calculation

    // Remove unit and possible children
    await knex('organisation')
      .where('leftId', '>=', unit.leftId)
      .andWhere('rightId', '<=', unit.rightId)
      .del();

    // Fix leftIds and rightIds
    await knex.raw(
      `
        UPDATE organisation
        SET "leftId" = "leftId" - ?
        WHERE "leftId" > ? 
      `,
      [reduce, unit.leftId],
    );

    await knex.raw(
      `
        UPDATE organisation
        SET "rightId" = "rightId" - ?
        WHERE "rightId" > ? 
      `,
      [reduce, unit.rightId],
    );

    return true;
  });

export const dbCreateOrganisation = fields =>
  knex.transaction(async trx => {
    // Get parent/sibling
    const parent = await trx('organisation')
      .select('*')
      .where({ id: fields.parent })
      .returning('*')
      .then(results => results[0]);

    // Make room for new unit
    if (fields.position === 'child') {
      // Update leftId & rightId
      await knex.raw(
        `
        UPDATE organisation
        SET "leftId" = "leftId" + 2, "rightId" = "rightId" + 2
        WHERE "leftId" > ? 
      `,
        parent.rightId,
      );

      // Update parent's rightId
      await knex.raw(
        `
        UPDATE organisation
        SET "rightId" = "rightId" + 2
        WHERE "id" = ?
      `,
        parent.id,
      );
    } else {
      await knex.raw(
        `
        UPDATE organisation
        SET "rightId" = "rightId" + 2
        WHERE "rightId" > ?
      `,
        parent.rightId,
      );
    }

    // Insert new organisation unit
    const leftId =
      fields.position === 'after' ? parent.rightId + 1 : parent.rightId;
    const rightId = leftId + 1;

    const unit = await trx('organisation')
      .insert({
        leftId,
        rightId,
        name: fields.name,
      })
      .returning('*')
      .then(results => results[0]);

    return unit;
  });
