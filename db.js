const { Pool } = require('pg');

// Configure the database connection
const pool = new Pool({
    user: 'userdb_22tl_user',
    host: 'dpg-cp92rc5ds78s73cc5gcg-a.virginia-postgres.render.com',
    database: 'userdb_22tl',
    password: 'ISyKC53x1cdB6k7REJ2orJuYOogxfTT6',
    port: 5432,
    ssl:true,
  });

// Function to get all members
const getMembers = async () => {
    const result = await pool.query('SELECT * FROM members');
    return result.rows;
};

// Function to create a new member
const createMember = async (name) => {
    const result = await pool.query('INSERT INTO members (name) VALUES ($1) RETURNING *', [name]);
    return result.rows[0];
};

const getMemberByName = async (name) => {
    const result = await pool.query('SELECT * FROM members WHERE name = $1', [name]);
    return result.rows[0];
};

// Function to get projects for a specific member
const getMemberProjects = async (memberId) => {
    const result = await pool.query('SELECT * FROM projects WHERE member_id = $1', [memberId]);
    return result.rows;
};

// Function to create a new project
const createProject = async (name, description, memberId) => {
    const result = await pool.query(
        'INSERT INTO projects (name, description, member_id) VALUES ($1, $2, $3) RETURNING *',
        [name, description, memberId]
    );
    return result.rows[0];
};

// Function to get project details by ID
const getProjectById = async (projectId) => {
    const result = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    return result.rows[0];
};

module.exports = {
    getMembers,
    createMember,
    getMemberByName,
    getMemberProjects,
    createProject,
    getProjectById
};
