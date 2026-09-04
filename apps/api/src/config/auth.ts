import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured in .env");
}

export const authConfig = {
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: "1d" as const,
};