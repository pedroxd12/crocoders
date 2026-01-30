// lib/auth.js
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en las variables de entorno');
}

const secret = new TextEncoder().encode(JWT_SECRET);

export const createToken = async (userData) => {
  try {
    return await new SignJWT(userData)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);
  } catch (error) {
    console.error('Error al crear token:', error);
    throw new Error('Error al generar el token de autenticación');
  }
};

export const verifyToken = async (token) => {
  try {
    if (!token) return null;
    
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error('Error al verificar token:', error.message);
    return null;
  }
};