import bcrypt from "bcrypt-edge";

export async function saltAndHashPassword(password: string) {
  // Define the number of salt rounds (higher is more secure but slower)
  const saltRounds = 10;

  // Generate the salt and hash the password
  const salt = bcrypt.genSaltSync(saltRounds);
  const hashedPassword = bcrypt.hashSync(password, salt);

  return hashedPassword;
}
