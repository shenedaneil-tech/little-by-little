import { accountStorage } from '../planner-assets';
export async function GET(){return new Response(accountStorage,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}})}
