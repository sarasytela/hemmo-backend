import uuid from 'uuid/v4';
import knex, { countAndPaginate, likeFilter, exactFilter } from '../utils/db';
import { dbGetChild } from './children';

export const dbGetFeedback = filters => (
  countAndPaginate(filters.limit, filters.offset,
    /* Subquery: Filter the feedback table */
    knex('feedback')
    .select([
      'feedback.*',
      'children.name as childName',
      'children.id as childId',
      'children.assigneeId as assigneeId',
      'employees.name as assigneeName',
    ])
    .where(likeFilter({
      name: filters.name,
      childName: filters.childName,
      assigneeName: filters.assigneeName,
      'feedback.reviewed': filters.reviewed,
    }))
    .andWhere(exactFilter({
      'feedback.childId': filters.childId,
      'feedback.assigneeId': filters.assigneeId,
    }))

    /* Join referred children and their assignees to table */
    .leftOuterJoin('children', 'feedback.childId', 'children.id')
    .leftOuterJoin('employees', 'children.assigneeId', 'employees.id')

    .orderBy(filters.orderBy || 'children.name', filters.order),
  )
);

export const dbGetSingleFeedback = id => (
  knex('feedback')
    .first([
      'feedback.*',
      'children.name as childName',
      'children.id as childId',
      'children.assigneeId as assigneeId',
      'employees.name as assigneeName',
    ])
    .where({ 'feedback.id': id })
    .leftOuterJoin('children', 'feedback.childId', 'children.id')
    .leftOuterJoin('employees', 'children.assigneeId', 'employees.id')
);

export const dbDelFeedback = id => (
  knex('feedback')
    .where({ id })
    .del()
);

export const dbCreateFeedback = async (childId) => {
  const child = await dbGetChild(childId);

  return knex('feedback')
    .insert({
      id: uuid(),
      childId,
      assigneeId: child.assigneeId,
    })
    .returning('*')
    .then(results => results[0]);
};

export const dbUpdateFeedback = (id, fields) => (
  knex('feedback')
    .update({ ...fields })
    .where({ id })
    .returning('*')
    .then(results => results[0])
);