import { sql } from 'bun';

const insertUser = {
  name: 'Alice',
  email: 'alice@example.com',
  age: 25,
};

const [user] = await sql`
  INSERT INTO users (name, email)
  VALUES (${insertUser.name}, ${insertUser.email})
  RETURNING *
`;

console.log(user);
