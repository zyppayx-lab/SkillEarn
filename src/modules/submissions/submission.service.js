// src/modules/submissions/submission.service.js

const db = require('../../config/db');

exports.submitProof = async ({ taskId, userId, proof }) => {
  const res = await db.query(
    `INSERT INTO submissions(task_id, user_id, proof, status)
     VALUES ($1,$2,$3,'PENDING')
     RETURNING *`,
    [taskId, userId, proof]
  );

  return res.rows[0];
};
