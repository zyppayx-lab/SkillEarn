// submissions.js
// FINAL PRODUCTION VERSION
// Auto reward credit
// Screenshot upload ready
// Duplicate protection
// Slot control
// Vendor approves own campaigns
// Admin override enabled

const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");

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
      message:
        "Unauthorized"
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
   ENSURE UPLOAD DIR
========================================== */
if (
  !fs.existsSync(
    "uploads"
  )
) {
  fs.mkdirSync(
    "uploads"
  );
}

/* ==========================================
   MULTER
========================================== */
const storage =
  multer.diskStorage({
    destination:
      (
        req,
        file,
        cb
      ) =>
        cb(
          null,
          "uploads/"
        ),

    filename:
      (
        req,
        file,
        cb
      ) =>
        cb(
          null,
          Date.now() +
            "-" +
            file.originalname.replace(
              /\s+/g,
              "-"
            )
        )
  });

const upload =
  multer({
    storage,
    limits: {
      fileSize:
        5 *
        1024 *
        1024
    }
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
  async (
    req,
    res
  ) => {
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

      if (
        !task_id
      ) {
        return res.status(400).json({
          message:
            "task_id required"
        });
      }

      // block duplicates
      const dup =
        await pool.query(
          `
          SELECT id
          FROM submissions
          WHERE user_id=$1
          AND task_id=$2
          `,
          [
            req.user.id,
            task_id
          ]
        );

      if (
        dup.rows.length >
        0
      ) {
        return res.status(400).json({
          message:
            "Already submitted"
        });
      }

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
          task_type ||
            "task",
          proof
        ]
      );

      res.json({
        message:
          "Submission sent"
      });

    } catch (
      error
    ) {
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
  async (
    req,
    res
  ) => {
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
          [
            req.user.id
          ]
        );

      res.json(
        result.rows
      );

    } catch (
      error
    ) {
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
  async (
    req,
    res
  ) => {
    try {
      const pool =
        req.app.locals.pool;

      const result =
        await pool.query(
          `
SELECT s.*, t.title
FROM submissions s
JOIN tasks t
ON s.task_id=t.id
WHERE t.vendor_id=$1
ORDER BY s.id DESC
          `,
          [
            req.user.id
          ]
        );

      res.json(
        result.rows
      );

    } catch (
      error
    ) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   APPROVE
========================================== */
router.post(
  "/api/business/submissions/approve",
  auth,
  vendorOnly,
  async (
    req,
    res
  ) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        submission_id
      } =
        req.body;

      const result =
        await pool.query(
          `
SELECT
s.id,
s.user_id,
s.status,
t.id AS task_id,
t.vendor_id,
t.reward
FROM submissions s
JOIN tasks t
ON s.task_id=t.id
WHERE s.id=$1
          `,
          [
            submission_id
          ]
        );

      if (
        result.rows
          .length ===
        0
      ) {
        return res.status(404).json({
          message:
            "Submission not found"
        });
      }

      const row =
        result.rows[0];

      if (
        req.user
          .role !==
          "admin" &&
        row.vendor_id !==
          req.user.id
      ) {
        return res.status(403).json({
          message:
            "Not your campaign"
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
        [
          submission_id
        ]
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
          "Task approved reward"
        ]
      );

      res.json({
        message:
          "Approved & user credited"
      });

    } catch (
      error
    ) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   REJECT
========================================== */
router.post(
  "/api/business/submissions/reject",
  auth,
  vendorOnly,
  async (
    req,
    res
  ) => {
    try {
      const pool =
        req.app.locals.pool;

      const {
        submission_id
      } =
        req.body;

      const result =
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
          [
            submission_id
          ]
        );

      if (
        result.rows
          .length ===
        0
      ) {
        return res.status(404).json({
          message:
            "Submission not found"
        });
      }

      const row =
        result.rows[0];

      if (
        req.user
          .role !==
          "admin" &&
        row.vendor_id !==
          req.user.id
      ) {
        return res.status(403).json({
          message:
            "Not your campaign"
        });
      }

      await pool.query(
        `
        UPDATE submissions
        SET status='REJECTED'
        WHERE id=$1
        `,
        [
          submission_id
        ]
      );

      res.json({
        message:
          "Rejected"
      });

    } catch (
      error
    ) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ==========================================
   ADMIN ALL
========================================== */
router.get(
  "/api/admin/submissions",
  auth,
  async (
    req,
    res
  ) => {
    if (
      req.user
        .role !==
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

    } catch (
      error
    ) {
      res.status(500).json({
        message:
          error.message
      });
    }
  }
);

module.exports =
  router;
