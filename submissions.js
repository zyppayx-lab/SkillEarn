// submissions.js
// FINAL VENDOR-CONTROLLED VERSION
// Vendors approve/reject their own task submissions
// Admin can view all + override
// Auto wallet credit from task reward

const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");

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

/* ==========================================
   ROLE CHECKS
========================================== */
function vendorOnly(
  req,
  res,
  next
) {
  if (
    req.user.role !==
      "vendor" &&
    req.user.role !==
      "admin"
  ) {
    return res.status(403).json({
      message:
        "Vendor only"
    });
  }

  next();
}

/* ==========================================
   UPLOADS
========================================== */
const storage =
  multer.diskStorage({
    destination:
      function (
        req,
        file,
        cb
      ) {
        cb(
          null,
          "uploads/"
        );
      },

    filename:
      function (
        req,
        file,
        cb
      ) {
        cb(
          null,
          Date.now() +
            "-" +
            file.originalname
        );
      }
  });

const upload =
  multer({
    storage
  });

/* ==========================================
   USER CREATE SUBMISSION
========================================== */
router.post(
  "/api/submissions/create",
  auth,
  upload.single(
    "screenshot"
  ),
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        task_id,
        task_type,
        proof_text,
        proof_link,
        username
      } = req.body;

      const screenshot =
        req.file
          ? req.file.path
          : null;

      const proof =
        JSON.stringify({
          proof_text:
            proof_text ||
            "",
          proof_link:
            proof_link ||
            "",
          username:
            username ||
            "",
          screenshot
        });

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
          proof
        ]
      );

      res.json({
        message:
          "Submission sent"
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
   USER MY SUBMISSIONS
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
   VENDOR VIEW OWN SUBMISSIONS
========================================== */
router.get(
  "/api/business/submissions",
  auth,
  vendorOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
          SELECT s.*
          FROM submissions s
          JOIN tasks t
          ON s.task_id=t.id
          WHERE t.vendor_id=$1
          ORDER BY s.id DESC
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
   VENDOR APPROVE SUBMISSION
========================================== */
router.post(
  "/api/business/submissions/approve",
  auth,
  vendorOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        submission_id
      } = req.body;

      const check =
        await pool.query(
          `
          SELECT
          s.id,
          s.user_id,
          s.status,
          t.reward,
          t.vendor_id
          FROM submissions s
          JOIN tasks t
          ON s.task_id=t.id
          WHERE s.id=$1
          `,
          [submission_id]
        );

      if (
        check.rows.length ===
        0
      ) {
        return res.status(404).json({
          message:
            "Submission not found"
        });
      }

      const row =
        check.rows[0];

      if (
        req.user.role !==
          "admin" &&
        row.vendor_id !==
          req.user.id
      ) {
        return res.status(403).json({
          message:
            "Not your task"
        });
      }

      if (
        row.status ===
        "APPROVED"
      ) {
        return res.json({
          message:
            "Already approved"
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
          row.reward,
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
          row.reward,
          "Task approved"
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
   VENDOR REJECT SUBMISSION
========================================== */
router.post(
  "/api/business/submissions/reject",
  auth,
  vendorOnly,
  async (req, res) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        submission_id
      } = req.body;

      const check =
        await pool.query(
          `
          SELECT
          s.id,
          t.vendor_id
          FROM submissions s
          JOIN tasks t
          ON s.task_id=t.id
          WHERE s.id=$1
          `,
          [submission_id]
        );

      if (
        check.rows.length ===
        0
      ) {
        return res.status(404).json({
          message:
            "Submission not found"
        });
      }

      const row =
        check.rows[0];

      if (
        req.user.role !==
          "admin" &&
        row.vendor_id !==
          req.user.id
      ) {
        return res.status(403).json({
          message:
            "Not your task"
        });
      }

      await pool.query(
        `
        UPDATE submissions
        SET status='REJECTED'
        WHERE id=$1
        `,
        [submission_id]
      );

      res.json({
        message:
          "Rejected"
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
   ADMIN VIEW ALL
========================================== */
router.get(
  "/api/admin/submissions",
  auth,
  async (req, res) => {
    if (
      req.user.role !==
      "admin"
    ) {
      return res.status(403).json({
        message:
          "Admins only"
      });
    }

    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
          SELECT *
          FROM submissions
          ORDER BY id DESC
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

module.exports = router;
