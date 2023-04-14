const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { Snowflake } = require("@theinternetfolks/snowflake");

let db = null;
let dbPath = path.join(__dirname, "saas.db");

const intiliazeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log(new Date().toISOString());
      console.log(Snowflake.generate({ timestamp: 2000 }));
      console.log(typeof Snowflake.generate());
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DBerror: ${e.message}`);
    process.exit(1);
  }
};

intiliazeDBAndServer();

app.post("/v1/role", async (request, response) => {
  const roleDetails = request.body;
  const { name } = roleDetails;

  const roleQuery = ` SELECT * FROM role WHERE name='${name}' ;`;
  const role = await db.get(roleQuery);
  console.log(role);

  if (role === undefined) {
    const id = Snowflake.generate({ timestamp: 2000 });
    const createRoleQuery = `   
                                 INSERT INTO role(id,name,created_at,updated_at)
                                 VALUES 
                                 ('${id}','${name}',
                                 '${new Date().toISOString()}','${new Date().toISOString()}') ; `;
    const output = await db.run(createRoleQuery);
    const roleQuery = ` SELECT * FROM role WHERE name='${name}' ;`;
    const role = await db.get(roleQuery);

    response.send({
      status: true,
      content: {
        data: role,
      },
    });
  } else {
    response.send({
      status: true,
      content: {
        data: role,
      },
    });
  }
});

app.get("/v1/role", async (request, response) => {
  const pageSize = 10;
  const { page = "1" } = request.query;

  const offset = (parseInt(page) - 1) * pageSize;

  const sql = `SELECT * FROM role LIMIT ${pageSize} OFFSET ${offset} ;`;

  const roles = await db.all(sql);

  const sqlCount = "SELECT COUNT(*) as count FROM role ;";

  const countRoles = await db.get(sqlCount);

  const total = countRoles.count;
  const pages = Math.ceil(total / pageSize);

  const output = {
    status: true,
    content: {
      meta: {
        total,
        pages,
        page,
      },

      data: roles,
    },
  };

  response.send(output);
});

app.post("/v1/auth/signup", async (request, response) => {
  const { name, email, password } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const Query = ` SELECT * FROM user WHERE email='${email}' ;`;
  const user = await db.get(Query);
  console.log(user);
  if (user === undefined) {
    if (name.length < 2) {
      response.status(400);
      response.send("user name is too short");
    } else if (password.length < 6) {
      response.status(400);
      response.send("password is too-short");
    } else {
      const id = Snowflake.generate({ timestamp: 2000 });
      const createUserQuery = `INSERT INTO user(id,name,password,email,created_at)
                                 VALUES 
                                 ('${id}','${name}','${hashedPassword}',
                                 '${email}','${new Date().toISOString()}') ; `;
      await db.run(createUserQuery);

      const getUserQuery = `SELECT * FROM user WHERE id ='${id}' ;`;
      const signUpUser = await db.get(getUserQuery);
      console.log(user);

      const payload = { email: email };
      const jwtToken = jwt.sign(payload, "SECRET");

      const output = {
        status: true,
        content: {
          data: {
            id: id,
            name,
            email,
            created_at: signUpUser.created_at,
          },
          meta: {
            access_token: jwtToken,
          },
        },
      };

      response.send(output);
    }
  } else {
    response.status(400).send("User already exists");
  }
});

app.post("/v1/auth/signin", async (request, response) => {
  const { email, password } = request.body;
  const Query = ` SELECT * FROM user WHERE email= '${email}' ;`;
  const user = await db.get(Query);
  console.log(user);

  if (user !== undefined) {
    const verifyPassword = await bcrypt.compare(password, user.password);
    if (verifyPassword === true) {
      const payload = { email: email };
      const jwtToken = jwt.sign(payload, "SECRET");
      console.log(jwtToken);
      const output = {
        status: true,
        content: {
          data: {
            id: user.id,
            name: user.name,
            email,
            created_at: user.created_at,
          },
          meta: {
            access_token: jwtToken,
          },
        },
      };

      response.send(output);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.email = payload.email;
        next();
      }
    });
  }
};

app.get("/v1/auth/me", authenticateToken, async (request, response) => {
  const { email } = request;
  const getUserQuery = `SELECT * FROM user WHERE email='${email}' ;`;

  const user = await db.get(getUserQuery);
  console.log(user);
  const output = {
    status: true,
    content: {
      data: {
        id: user.id,
        name: user.name,
        email,
        created_at: user.created_at,
      },
    },
  };

  console.log(user);
  response.send(output);
});

app.post("/v1/community", authenticateToken, async (request, response) => {
  const { email } = request;
  const { name } = request.body;
  console.log(email);

  const checkCommunityQuery = `SELECT * FROM community WHERE slug='${name.toLowerCase()}' ;`;
  const checkCommunity = await db.get(checkCommunityQuery);

  const getUserQuery = `SELECT * FROM user WHERE email ='${email}' ;`;
  const user = await db.get(getUserQuery);
  console.log(user);

  if (checkCommunity === undefined) {
    const getUserQuery = `SELECT * FROM user WHERE email ='${email}' ;`;
    const user = await db.get(getUserQuery);
    console.log(user);

    const getRoleQuery = `SELECT * FROM role WHERE name='Community Admin';`;
    const role = await db.get(getRoleQuery);
    console.log(role);

    const Id = Snowflake.generate({ timestamp: 2000 });
    const createCommunityQuery = `   
                                 INSERT INTO community(id,name,slug,owner,created_at,updated_at)
                                 VALUES 
                                 ('${Id}','${name}',
                                 '${name.toLowerCase()}','${user.id}',
                                 '${new Date().toISOString()}','${new Date().toISOString()}') ; `;
    await db.run(createCommunityQuery);

    const communityQuery = `SELECT * FROM community WHERE slug= '${name.toLowerCase()}' ;`;
    const community = await db.get(communityQuery);
    const memberId = Snowflake.generate({ timestamp: 2000 });
    const addMemberQuery = `INSERT INTO member(id,community,user,role,created_at)
                                 VALUES 
                                 ('${memberId}','${community.id}',
                                 '${community.owner}','${role.id}',
                                 '${new Date().toISOString()}') ; `;
    await db.run(addMemberQuery);

    const output = {
      status: true,
      content: {
        data: {
          id: community.id,
          name: community.name,
          slug: community.slug,
          owner: community.owner,
          created_at: community.created_at,
          updated_at: community.updated_at,
        },
      },
    };
    console.log(output);
    response.send(output);
  } else {
    response.status(400);
    console.log(checkCommunity);
    response.send("Community exists");
  }
});

app.get("/v1/community", authenticateToken, async (request, response) => {
  const pageSize = 10;
  const { page = "1" } = request.query;

  const offset = (parseInt(page) - 1) * pageSize;

  const sql = `SELECT * FROM community LIMIT ${pageSize} OFFSET ${offset} ;`;

  const roles = await db.all(sql);

  const sqlCount = "SELECT COUNT(*) as count FROM community ;";

  const countRoles = await db.get(sqlCount);

  const total = countRoles.count;
  const pages = Math.ceil(total / pageSize);
  console.log(total);
  console.log(pages);

  const joinTableQuery = `SELECT (community.id)AS id,(community.name) AS name, (community.slug)As slug, 
                           (community.created_at) AS created_at, (community.updated_at) AS updated_at, (user.name) AS owner_name, (user.id) AS owner_id
                        FROM community
                        INNER JOIN user ON user.id = community.owner;`;

  const getAllCommunities = await db.all(joinTableQuery);

  const data = getAllCommunities.map((eachItem) => ({
    id: eachItem.id,
    name: eachItem.name,
    slug: eachItem.slug,
    owner: {
      id: eachItem.owner_id,
      name: eachItem.owner_name,
    },
    created_at: eachItem.created_at,
    updated_at: eachItem.updated_at,
  }));

  console.log(getAllCommunities);
  const output = {
    status: true,
    content: {
      meta: {
        total,
        pages,
        page,
      },

      data: data,
    },
  };

  response.send(output);
});

app.get(
  "/v1/community/:id/members",
  authenticateToken,
  async (request, response) => {
    const { id } = request.params;
    const joinTableQuery = `SELECT community.id AS community_id,member.id AS member_id, community.slug AS slug, user.id AS user_id,
                              user.name AS user_name,role.id AS role_id, role.name AS role_name, member.created_at AS created_at FROM (((member
                        INNER JOIN community ON member.community = community.id) 
                        INNER JOIN role ON role.id= member.role)  
                        INNER JOIN user ON user.id = member.user)
                        WHERE community.slug = '${id}';`;
    const queries = await db.all(joinTableQuery);
    if (queries === undefined) {
      response.status(400).send("Doesnot exists");
    }
    const data = queries.map((eachItem) => ({
      id: eachItem.member_id,
      community: eachItem.community_id,
      user: {
        id: eachItem.user_id,
        name: eachItem.name,
      },
      role: {
        id: eachItem.role_id,
        name: eachItem.role_name,
      },
      created_at: eachItem.created_at,
    }));
    const output = {
      status: true,
      content: {
        meta: {},
        data,
      },
    };

    response.send(output);
  }
);

app.get(
  "/v1/community/me/owner",
  authenticateToken,
  async (request, response) => {
    const { email } = request;
    console.log(email);

    const userQuery = `SELECT * FROM user WHERE email='${email}' ;`;
    const user = await db.get(userQuery);

    const communityOwnerQuery = `SELECT * FROM community WHERE community.owner='${user.id}'`;
    const communities = await db.all(communityOwnerQuery);
    communities;
    const output = {
      status: true,
      content: {
        meta: {},
        data: communities,
      },
    };

    response.send(output);
  }
);

app.get(
  "/v1/community/me/member",
  authenticateToken,
  async (request, response) => {
    const { email } = request;
    const userQuery = `SELECT * FROM user WHERE email='${email}' ;`;
    const user = await db.get(userQuery);

    const pageSize = 10;
    const { page = "1" } = request.query;

    const offset = (parseInt(page) - 1) * pageSize;

    const sql = `SELECT * FROM community LIMIT ${pageSize} OFFSET ${offset} ;`;

    const roles = await db.all(sql);

    const sqlCount = `SELECT COUNT(*) as count FROM member WHERE member.user = ${user.id};`;

    const countRoles = await db.get(sqlCount);

    const total = countRoles.count;
    const pages = Math.ceil(total / pageSize);
    console.log(total);
    console.log(pages);

    const joinTableQuery = `SELECT community.id AS community_id,community.name AS community_name, 
                            community.slug AS slug, user.name AS user_name, user.id AS user_id, community.created_at, 
                            community.updated_at FROM ((member
                        INNER JOIN community ON member.community = community.id)  
                        INNER JOIN user ON user.id = community.owner) 
                        WHERE member.user=${user.id};`;
    const userAsMember = await db.all(joinTableQuery);

    const data = userAsMember.map((eachItem) => ({
      id: eachItem.community_id,
      name: eachItem.community_name,
      slug: eachItem.slug,
      owner: {
        id: eachItem.user_id,
        name: eachItem.user_name,
      },
      created_at: eachItem.created_at,
      updated_at: eachItem.updated_at,
    }));

    const output = {
      status: true,
      content: {
        meta: {
          total,
          pages,
          page,
        },
        data: data,
      },
    };

    response.send(output);
  }
);

app.post("/v1/member", authenticateToken, async (request, response) => {
  const { email } = request;
  const { community, role, user } = request.body;
  const userQuery = `SELECT * FROM user WHERE email='${email}' ;`;
  const signUser = await db.get(userQuery);
  console.log(signUser);

  const checkRoleQuery = `SELECT * FROM role WHERE role.name="Community Admin" ;`;
  const checkRole = await db.get(checkRoleQuery);
  console.log(checkRole);
  const checkUserRole = `SELECT * FROM member WHERE member.community='${community}' AND member.user='${signUser.id}' AND member.role='${checkRole.id}'`;

  console.log(checkUserRole);

  const userRole = await db.get(checkUserRole);

  console.log(userRole);

  if (userRole !== undefined) {
    const checkMemberQuery = `SELECT * FROM member WHERE community=${community} AND user=${user} AND role=${role} ;`;
    const member = await db.get(checkMemberQuery);

    if (member === undefined) {
      const memberId = Snowflake.generate({ timestamp: 2000 });
      const addMemberQuery = `INSERT INTO member(id,community,user,role,created_at)
                                 VALUES 
                                 ('${memberId}','${community}',
                                 '${user}','${role}',
                                 '${new Date().toISOString()}') ; `;
      await db.run(addMemberQuery);
      const memberQuery = `SELECT * FROM member WHERE community=${community} AND user=${user} AND role=${role} ;`;
      const member = await db.all(memberQuery);
      console.log(member);
      const output = {
        status: true,
        content: {
          data: {
            member,
          },
        },
      };
      response.send(output);
    } else {
      response.status(400).send("member already exists");
    }
  } else {
    response.status(400);
    response.send("NOT_ALLOWED_ACCESS ");
  }
});

app.delete("/v1/member/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const memberQuery = `SELECT * FROM member WHERE member.id=${id}`;
  const aboutMember = await db.get(memberQuery);
  console.log(aboutMember);

  const { email } = request;
  const { community, role, user } = request.body;
  const userQuery = `SELECT * FROM user WHERE email='${email}' ;`;
  const signUser = await db.get(userQuery);

  const checkRoleQuery = `SELECT * FROM role WHERE role.name="Community Admin" OR role.name="Community Moderator" ;`;
  const checkRole = await db.all(checkRoleQuery);

  const checkUserRole = `SELECT * FROM member WHERE member.community='${aboutMember.community}' AND member.id='${signUser.id}' AND member.role='${checkRole[0].id}' OR member.role ='${checkRole[1].id}' ;`;

  const userRole = await db.all(checkUserRole);

  if (userRole !== undefined) {
    const deleteQuery = `DELETE FROM member WHERE id='${id}' ;`;
    await db.run(deleteQuery);
    response.send({ status: true });
  } else {
    response.status(400);
    response.send("NOT_ALLOWED_ACCESS ");
  }
});
