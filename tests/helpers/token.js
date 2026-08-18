import { SignJWT } from 'jose';
export const DESIGNER = {
    id: 'cdesigner000000001',
    email: 'designer@test.com',
    nome: 'Test Designer',
    tipo: 'DESIGNER',
};
export const CLIENTE = {
    id: 'ccliente0000000001',
    email: 'cliente@test.com',
    nome: 'Test Cliente',
    tipo: 'CLIENTE',
};
export const ADMIN = {
    id: 'cadmin00000000001',
    email: 'admin@test.com',
    nome: 'Test Admin',
    tipo: 'ADMIN',
};
export async function makeToken(user = DESIGNER) {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    return new SignJWT({ email: user.email, nome: user.nome, tipo: user.tipo })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setExpirationTime('1h')
        .sign(secret);
}
export const ORIGIN = { origin: 'http://localhost:3000' };
//# sourceMappingURL=token.js.map