import { html } from './planner-assets';
export const dynamic = 'force-dynamic';
export async function GET() { return new Response(html, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Permissions-Policy':'geolocation=(self)'}}); }
