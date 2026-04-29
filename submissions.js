// submissions.js
// FINAL PRODUCTION VERSION
// Multi-type task submissions for SkillEarn

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* ==========================================
   AUTH
========================================== */
function auth(req, res, next) {
  const header =
    req.headers.authorization || "";

  const token =
    header.replace("Bearer ", "");

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    next();

  } catch {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }
}

function adminOnly(
  req,
  res,
  next
) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin only"
    });
  }

  next();
}

/* ==========================================
   SUBMISSION METHODS
========================================== */
/*
1. screenshot_url
2. text_answer
3. profile_link
4. post_link
5. referral_username
6. file_url
7. email_proof
8. wallet_address
9. comment_text
10. custom_json
*/

/* ==========================================
   CREATE SUBMISSION
========================================== */
router.post(
  "/api/submissions/create",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        task_id,
        task_type,
        method,
        proof
      } = req.body;

      if (
        !task_id ||
        !task_type ||
        !method ||
        !proof
      ) {
        return res.status(400).json({
          message:
            "Missing required fields"
        });
      }

      const allowed =
        [
          "screenshot_url",
          "text_answer",
          "profile_link",
          "post_link",
          "referral_username",
          "file_url",
          "email_proof",
          "wallet_address",
          "comment_text",
          "custom_json"
        ];

      if (
        !allowed.includes(
          method
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid submission method"
        });
      }

      const check =
        await pool.query(
          `
          SELECT id
          FROM submissions
          WHERE user_id=$1
          AND task_id=$2
          AND task_type=$3
          `,
          [
            req.user.id,
            task_id,
            task_type
          ]
        );

      if (
        check.rows.length > 0
      ) {
        return res.status(400).json({
          message:
            "Already submitted"
        });
      }

      await pool.query(
        `
        INSERT INTO submissions
        (
          user_id,
          task_id,
          task_type,
          proof,
          status
        )
        VALUES
        ($1,$2,$3,$4,'PENDING')
        `,
        [
          req.user.id,
          task_id,
          task_type,
          JSON.stringify({
            method,
            value: proof
          })
        ]
      );

      res.json({
        message:
          "Submission received"
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   USER SUBMISSIONS
========================================== */
router.get(
  "/api/submissions/my",
  auth,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
          SELECT *
          FROM submissions
          WHERE user_id=$1
          ORDER BY id DESC
          `,
          [req.user.id]
        );

      res.json(
        result.rows
      );

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   ADMIN VIEW ALL PENDING
========================================== */
router.get(
  "/api/admin/submissions",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
          SELECT *
          FROM submissions
          WHERE status='PENDING'
          ORDER BY id ASC
          `
        );

      res.json(
        result.rows
      );

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   APPROVE SUBMISSION
========================================== */
router.post(
  "/api/admin/submissions/approve",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        submission_id,
        reward
      } = req.body;

      const find =
        await pool.query(
          `
          SELECT *
          FROM submissions
          WHERE id=$1
          `,
          [submission_id]
        );

      if (
        find.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "Submission not found"
        });
      }

      const row =
        find.rows[0];

      if (
        row.status !==
        "PENDING"
      ) {
        return res.status(400).json({
          message:
            "Already processed"
        });
      }

      await pool.query(
        `
        UPDATE submissions
        SET status='APPROVED'
        WHERE id=$1
        `,
        [submission_id]
      );

      await pool.query(
        `
        UPDATE users
        SET balance =
        balance + $1
        WHERE id=$2
        `,
        [
          reward,
          row.user_id
        ]
      );

      await pool.query(
        `
        INSERT INTO transactions
        (
          user_id,
          type,
          amount,
          description,
          status
        )
        VALUES
        ($1,'earning',$2,$3,'SUCCESS')
        `,
        [
          row.user_id,
          reward,
          "Task approved"
        ]
      );

      await pool.query(
        `
        INSERT INTO notifications
        (
          user_id,
          title,
          message
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          row.user_id,
          "Submission Approved",
          "You earned ₦" +
            reward
        ]
      );

      res.json({
        message:
          "Approved successfully"
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   REJECT SUBMISSION
========================================== */
router.post(
  "/api/admin/submissions/reject",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        submission_id,
        reason
      } = req.body;

      const find =
        await pool.query(
          `
          SELECT *
          FROM submissions
          WHERE id=$1
          `,
          [submission_id]
        );

      if (
        find.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "Submission not found"
        });
      }

      const row =
        find.rows[0];

      await pool.query(
        `
        UPDATE submissions
        SET status='REJECTED'
        WHERE id=$1
        `,
        [submission_id]
      );

      await pool.query(
        `
        INSERT INTO notifications
        (
          user_id,
          title,
          message
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          row.user_id,
          "Submission Rejected",
          reason ||
            "Your proof was rejected"
        ]
      );

      res.json({
        message:
          "Rejected successfully"
      });

    } catch (error) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

module.exports = router;
