// frontend-config.js
// Save this file as: frontend-config.js
// Connect all your HTML pages to backend

const BASE_URL =
"https://your-backend-domain.com";

/* ==================================================
   USER LOGIN
================================================== */
async function userLogin(email, password) {
  const res = await fetch(
    BASE_URL + "/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    }
  );

  const data = await res.json();

  if (data.access) {
    localStorage.setItem(
      "token",
      data.access
    );
    location.href =
      "user-dashboard.html";
  } else {
    alert(data.message);
  }
}

/* ==================================================
   BUSINESS LOGIN
================================================== */
async function businessLogin(
  email,
  password
) {
  const res = await fetch(
    BASE_URL +
      "/api/business/login",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    }
  );

  const data = await res.json();

  if (data.access) {
    localStorage.setItem(
      "token",
      data.access
    );
    location.href =
      "business-dashboard.html";
  } else {
    alert(data.message);
  }
}

/* ==================================================
   ADMIN LOGIN
================================================== */
async function adminLogin(
  email,
  password
) {
  const res = await fetch(
    BASE_URL +
      "/api/admin/login",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    }
  );

  const data = await res.json();

  if (data.access) {
    localStorage.setItem(
      "token",
      data.access
    );
    location.href =
      "admin-dashboard.html";
  } else {
    alert(data.message);
  }
}

/* ==================================================
   LOAD TASKS
================================================== */
async function loadTasks() {
  const res = await fetch(
    BASE_URL + "/api/tasks"
  );

  const data = await res.json();

  console.log(data);
}

/* ==================================================
   USER WALLET
================================================== */
async function loadWallet() {
  const token =
    localStorage.getItem("token");

  const res = await fetch(
    BASE_URL +
      "/api/users/wallet",
    {
      headers: {
        Authorization:
          "Bearer " + token
      }
    }
  );

  const data = await res.json();

  console.log(data);
}

/* ==================================================
   LOGOUT
================================================== */
function logout() {
  localStorage.removeItem(
    "token"
  );

  location.href = "login.html";
}
