import { javascript } from '../planner-assets';
export async function GET() { return new Response(javascript, {headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}}); }
