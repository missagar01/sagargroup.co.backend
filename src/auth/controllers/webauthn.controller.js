const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const { loginQuery } = require("../../../config/pg.js");
const jwt = require("jsonwebtoken");

const rpName = process.env.WEBAUTHN_RP_NAME;
const rpID = process.env.WEBAUTHN_RP_ID ;
const origin = process.env.WEBAUTHN_ORIGIN ;

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";
const FACE_DESCRIPTOR_LENGTH = 128;
const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.4);
const FACE_DUPLICATE_REJECT_THRESHOLD = Number(process.env.FACE_DUPLICATE_REJECT_THRESHOLD || 0.35);

const FACE_USER_LOOKUP_QUERY = `
  SELECT id, user_name, employee_id
  FROM users
  WHERE user_name = $1 OR employee_id = $1
  LIMIT 1
`;

const FACE_USER_LOOKUP_FALLBACK_QUERY = `
  SELECT id, user_name, employee_id
  FROM users
  WHERE TRIM(user_name) = $1 OR TRIM(COALESCE(employee_id, '')) = $1
  LIMIT 1
`;

function getJwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.JWT_SCREAT ||
    process.env.JWT_SECREAT ||
    process.env.jwt_secret ||
    process.env.jwt_screat ||
    process.env.jwt_secreat ||
    null
  );
}

function signToken(user) {
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    throw new Error("JWT secret not configured");
  }

  return jwt.sign(
    {
      id: user.id,
      username: user.user_name || user.username,
      user_name: user.user_name || user.username,
      role: user.role || "user",
      user_access: user.user_access || "",
      user_access1: user.user_access1 || "",
      page_access: user.page_access || "",
      system_access: user.system_access || "",
      store_access: user.store_access || "",
      verify_access: user.verify_access || "",
      verify_access_dept: user.verify_access_dept || "",
      employee_id: user.employee_id || "",
      email_id: user.email_id || "",
      department: user.department || "",
      designation: user.designation || "",
      division: user.division || "",
    },
    jwtSecret,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && (value.toUpperCase() === "NULL" || value.trim() === "")) {
    return null;
  }
  return value;
}

function isValidDescriptor(descriptor) {
  return (
    Array.isArray(descriptor) &&
    descriptor.length === FACE_DESCRIPTOR_LENGTH &&
    descriptor.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

function isDescriptorEmpty(descriptor) {
  return descriptor.every((value) => value === 0);
}

function parseStoredDescriptor(rawDescriptor) {
  if (isValidDescriptor(rawDescriptor)) {
    return rawDescriptor;
  }

  if (typeof rawDescriptor === "string" && rawDescriptor.trim()) {
    try {
      const parsedDescriptor = JSON.parse(rawDescriptor);
      return isValidDescriptor(parsedDescriptor) ? parsedDescriptor : null;
    } catch {
      return null;
    }
  }

  return null;
}

async function findUserByLoginId(loginId) {
  const normalizedLoginId = String(loginId || "").trim();
  if (!normalizedLoginId) {
    return null;
  }

  let result = await loginQuery(FACE_USER_LOOKUP_QUERY, [normalizedLoginId]);
  if (!result.rows || result.rows.length === 0) {
    result = await loginQuery(FACE_USER_LOOKUP_FALLBACK_QUERY, [normalizedLoginId]);
  }

  return result.rows?.[0] || null;
}

async function findClosestRegisteredFace(descriptor, { excludeUserId = null } = {}) {
  const params = ["face"];
  let query = `SELECT user_id, transports FROM user_passkeys WHERE webauthn_user_id = $1`;

  if (excludeUserId !== null && excludeUserId !== undefined) {
    params.push(excludeUserId);
    query += ` AND user_id <> $2`;
  }

  const allFacesResult = await loginQuery(query, params);
  const rows = allFacesResult.rows || [];

  let bestMatch = {
    userId: null,
    distance: Infinity,
  };

  for (const row of rows) {
    const dbDescriptor = parseStoredDescriptor(row.transports);
    if (!dbDescriptor) {
      console.warn(`[Face Biometrics] Skipping invalid stored descriptor for user_id ${row.user_id}`);
      continue;
    }

    const distance = getEuclideanDistance(descriptor, dbDescriptor);
    if (distance < bestMatch.distance) {
      bestMatch = {
        userId: row.user_id,
        distance,
      };
    }
  }

  return bestMatch;
}

// Memory store for challenges (since we don't want to use DB session just for challenges).
// In production, Redis or a DB column is better.
const challenges = new Map();

// Generate options for registering a new passkey
async function registerOptions(req, res) {
  try {
    const user = req.user; // from authenticate middleware
    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userPasskeysResult = await loginQuery(
      `SELECT id FROM user_passkeys WHERE user_id = $1`,
      [user.id]
    );
    const userPasskeys = userPasskeysResult.rows || [];

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(String(user.id)),
      userName: user.user_name || user.username || user.email_id || String(user.id),
      userDisplayName: user.user_name || "User",
      attestationType: "none",
      excludeCredentials: userPasskeys.map((passkey) => ({
        id: Buffer.from(passkey.id, "base64url"),
        type: "public-key",
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    challenges.set(`reg_${user.id}`, options.challenge);

    res.status(200).json({ success: true, options });
  } catch (error) {
    console.error("registerOptions Error:", error);
    res.status(500).json({ success: false, message: "Error generating registration options" });
  }
}

// Verify passkey registration response
async function registerVerify(req, res) {
  try {
    const user = req.user;
    const body = req.body;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const expectedChallenge = challenges.get(`reg_${user.id}`);
    if (!expectedChallenge) {
      return res.status(400).json({ success: false, message: "Registration challenge not found or expired" });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
      const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

      const credIdBase64url = credentialID;
      const publicKeyBuffer = Buffer.from(credentialPublicKey);

      await loginQuery(
        `INSERT INTO user_passkeys 
        (id, user_id, webauthn_user_id, public_key, counter, device_type, backed_up, transports)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          credIdBase64url,
          user.id,
          String(user.id),
          publicKeyBuffer,
          counter,
          credentialDeviceType,
          credentialBackedUp,
          JSON.stringify(body.response.transports || [])
        ]
      );

      challenges.delete(`reg_${user.id}`);

      res.status(200).json({ success: true, message: "Passkey registered successfully" });
    } else {
      res.status(400).json({ success: false, message: "Registration verification failed" });
    }
  } catch (error) {
    console.error("registerVerify Error:", error);
    res.status(500).json({ success: false, message: error.message || "Error verifying registration" });
  }
}

// Generate options for authentication (login)
async function loginOptions(req, res) {
  try {
    const { username } = req.body;

    let allowCredentials = [];

    // If username is provided, lookup their specific passkeys
    if (username) {
      const userResult = await loginQuery(
        `SELECT id FROM users WHERE user_name = $1 OR employee_id = $1 LIMIT 1`,
        [username]
      );

      if (userResult.rows && userResult.rows.length > 0) {
        const dbUser = userResult.rows[0];
        const passkeysResult = await loginQuery(
          `SELECT id FROM user_passkeys WHERE user_id = $1`,
          [dbUser.id]
        );
        allowCredentials = (passkeysResult.rows || []).map((pk) => ({
          id: Buffer.from(pk.id, "base64url"),
          type: "public-key",
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    // Store challenge keyed by random session id, or return it to client to send back
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    challenges.set(`auth_${sessionId}`, options.challenge);

    res.status(200).json({ success: true, options, sessionId });
  } catch (error) {
    console.error("loginOptions Error:", error);
    res.status(500).json({ success: false, message: "Error generating authentication options" });
  }
}

// Verify passkey authentication response
async function loginVerify(req, res) {
  try {
    const { body, sessionId } = req.body;

    const expectedChallenge = challenges.get(`auth_${sessionId}`);
    if (!expectedChallenge) {
      return res.status(400).json({ success: false, message: "Authentication challenge not found or expired" });
    }

    const passkeyResult = await loginQuery(
      `SELECT * FROM user_passkeys WHERE id = $1 LIMIT 1`,
      [body.id]
    );

    if (!passkeyResult.rows || passkeyResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Passkey not found" });
    }

    const passkey = passkeyResult.rows[0];

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: passkey.public_key,
        counter: Number(passkey.counter),
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      },
      requireUserVerification: true,
    });

    const { verified, authenticationInfo } = verification;

    if (verified) {
      // Update counter
      await loginQuery(`UPDATE user_passkeys SET counter = $1 WHERE id = $2`, [
        authenticationInfo.newCounter,
        passkey.id,
      ]);

      challenges.delete(`auth_${sessionId}`);

      // Log user in
      const userResult = await loginQuery(
        `SELECT
          id,
          user_name,
          password,
          email_id,
          department,
          user_access1,
          given_by,
          role,
          COALESCE(status, 'active') AS status,
          user_access,
          page_access,
          system_access,
          store_access,
          verify_access,
          verify_access_dept,
          designation,
          division,
          remark,
          employee_id
        FROM users WHERE id = $1 LIMIT 1`,
        [passkey.user_id]
      );

      const user = userResult.rows[0];

      if (user.status && user.status.toLowerCase() === "inactive") {
        return res.status(403).json({ success: false, message: "Account is inactive" });
      }

      const normalizedUser = {
        id: user.id,
        role: user.role || "user",
        user_name: user.user_name,
        username: user.user_name,
        user_access: normalizeValue(user.user_access),
        user_access1: normalizeValue(user.user_access1),
        page_access: normalizeValue(user.page_access),
        system_access: normalizeValue(user.system_access),
        store_access: normalizeValue(user.store_access),
        verify_access: normalizeValue(user.verify_access),
        verify_access_dept: normalizeValue(user.verify_access_dept),
        employee_id: normalizeValue(user.employee_id),
        email_id: normalizeValue(user.email_id),
        department: normalizeValue(user.department),
        designation: normalizeValue(user.designation),
        division: normalizeValue(user.division),
        status: user.status || "active",
      };

      const token = signToken(normalizedUser);

      try {
        await loginQuery(`UPDATE users SET session_token = $1 WHERE id = $2`, [token, user.id]);
      } catch (err) {
        console.warn("Could not store session_token:", err.message);
      }

      res.status(200).json({
        success: true,
        data: {
          user: normalizedUser,
          token,
          user_access: normalizedUser.user_access,
          user_access1: normalizedUser.user_access1,
          page_access: normalizedUser.page_access,
          system_access: normalizedUser.system_access,
          store_access: normalizedUser.store_access,
          verify_access: normalizedUser.verify_access,
          verify_access_dept: normalizedUser.verify_access_dept,
          designation: normalizedUser.designation,
          division: normalizedUser.division,
          role: normalizedUser.role,
        },
      });
    } else {
      res.status(400).json({ success: false, message: "Authentication verification failed" });
    }
  } catch (error) {
    console.error("loginVerify Error:", error);
    res.status(500).json({ success: false, message: error.message || "Error verifying authentication" });
  }
}

// Euclidean distance for face matching
function getEuclideanDistance(arr1, arr2) {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) {
    return Infinity;
  }
  return Math.sqrt(
    arr1.map((val, i) => val - arr2[i]).reduce((sum, diff) => sum + diff * diff, 0)
  );
}

// Register face descriptor
async function registerFace(req, res) {
  try {
    const user = req.user;
    const { descriptor } = req.body;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!isValidDescriptor(descriptor)) {
      return res.status(400).json({ success: false, message: "Invalid face descriptor" });
    }

    if (isDescriptorEmpty(descriptor)) {
      return res.status(400).json({ success: false, message: "Invalid face scan. Please scan again in proper light." });
    }

    const closestOtherFace = await findClosestRegisteredFace(descriptor, { excludeUserId: user.id });
    if (closestOtherFace.userId && closestOtherFace.distance < FACE_DUPLICATE_REJECT_THRESHOLD) {
      console.warn(
        `[Face Biometrics] Registration rejected for user_id ${user.id}. Descriptor too close to user_id ${closestOtherFace.userId} at distance ${closestOtherFace.distance.toFixed(4)}`
      );
      return res.status(409).json({
        success: false,
        message: "This face is already too similar to another registered account. Please rescan clearly or contact admin.",
      });
    }

    const faceId = `face_${user.id}`;
    
    // Check if face is already registered, if so, delete it first
    await loginQuery(`DELETE FROM user_passkeys WHERE user_id = $1 AND webauthn_user_id = 'face'`, [user.id]);

    // Insert new face record
    await loginQuery(
      `INSERT INTO user_passkeys 
      (id, user_id, webauthn_user_id, transports, counter)
      VALUES ($1, $2, $3, $4, $5)`,
      [
        faceId,
        user.id,
        'face',
        JSON.stringify(descriptor),
        0
      ]
    );

    res.status(200).json({ success: true, message: "Face registered successfully!" });
  } catch (error) {
    console.error("registerFace Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to register face" });
  }
}

// Login using face matching
async function loginFace(req, res) {
  try {
    const { username, descriptor } = req.body;

    if (!String(username || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Username or employee ID is required for face login.",
      });
    }

    if (!isValidDescriptor(descriptor)) {
      return res.status(400).json({ success: false, message: "A valid face descriptor is required" });
    }

    // Extra Security: Check if descriptor contains invalid/all-zero values
    if (isDescriptorEmpty(descriptor)) {
      console.warn("Rejected face login attempt: Scanned descriptor is all zeros or invalid.");
      return res.status(400).json({ success: false, message: "Invalid camera scan detected. Please position your face clearly in the camera light." });
    }

    const claimedUser = await findUserByLoginId(username);
    if (!claimedUser?.id) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const passkeyResult = await loginQuery(
      `SELECT transports FROM user_passkeys WHERE user_id = $1 AND webauthn_user_id = 'face' LIMIT 1`,
      [claimedUser.id]
    );

    if (!passkeyResult.rows || passkeyResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "No registered face found for this user. Please register first." });
    }

    const claimedDescriptor = parseStoredDescriptor(passkeyResult.rows[0].transports);
    if (!claimedDescriptor) {
      return res.status(500).json({ success: false, message: "Registered face data is corrupted. Please register again." });
    }

    const claimedDistance = getEuclideanDistance(descriptor, claimedDescriptor);

    console.log(
      `[Face Biometrics] Claimed user '${username.trim()}' => distance=${claimedDistance.toFixed(4)}`
    );

    if (claimedDistance >= FACE_MATCH_THRESHOLD) {
      console.warn(
        `[Face Biometrics] Match rejected for claimed user '${username.trim()}'. Distance ${claimedDistance.toFixed(4)} is >= threshold ${FACE_MATCH_THRESHOLD}`
      );
      return res.status(400).json({
        success: false,
        message: "Face match failed for this user. Please retry in better light or use password login.",
      });
    }

    const matchedUserId = claimedUser.id;

    // Retrieve user details from database
    const userResult = await loginQuery(
      `SELECT
        id,
        user_name,
        password,
        email_id,
        department,
        user_access1,
        given_by,
        role,
        COALESCE(status, 'active') AS status,
        user_access,
        page_access,
        system_access,
        store_access,
        verify_access,
        verify_access_dept,
        designation,
        division,
        remark,
        employee_id
      FROM users WHERE id = $1 LIMIT 1`,
      [matchedUserId]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User profile not found in database" });
    }

    const user = userResult.rows[0];

    if (user.status && user.status.toLowerCase() === "inactive") {
      return res.status(403).json({ success: false, message: "Account is inactive" });
    }

    const normalizedUser = {
      id: user.id,
      role: user.role || "user",
      user_name: user.user_name,
      username: user.user_name,
      user_access: normalizeValue(user.user_access),
      user_access1: normalizeValue(user.user_access1),
      page_access: normalizeValue(user.page_access),
      system_access: normalizeValue(user.system_access),
      store_access: normalizeValue(user.store_access),
      verify_access: normalizeValue(user.verify_access),
      verify_access_dept: normalizeValue(user.verify_access_dept),
      employee_id: normalizeValue(user.employee_id),
      email_id: normalizeValue(user.email_id),
      department: normalizeValue(user.department),
      designation: normalizeValue(user.designation),
      division: normalizeValue(user.division),
      status: user.status || "active",
    };

    const token = signToken(normalizedUser);

    try {
      await loginQuery(`UPDATE users SET session_token = $1 WHERE id = $2`, [token, user.id]);
    } catch (err) {
      console.warn("Could not store session_token:", err.message);
    }

    res.status(200).json({
      success: true,
      data: {
        user: normalizedUser,
        token,
        user_access: normalizedUser.user_access,
        user_access1: normalizedUser.user_access1,
        page_access: normalizedUser.page_access,
        system_access: normalizedUser.system_access,
        store_access: normalizedUser.store_access,
        verify_access: normalizedUser.verify_access,
        verify_access_dept: normalizedUser.verify_access_dept,
        designation: normalizedUser.designation,
        division: normalizedUser.division,
        role: normalizedUser.role,
      },
    });
  } catch (error) {
    console.error("loginFace Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to authenticate face" });
  }
}

module.exports = {
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  registerFace,
  loginFace,
};
