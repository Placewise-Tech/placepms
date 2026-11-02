import { loadEnv } from 'vite';
import { serverClients } from '../server/workspace-http.js';
import { createManagedAccount, managementError } from '../server/management.js';

const argument=(name:string)=>{const index=process.argv.indexOf(name);return index<0?'':process.argv[index+1] || '';};
async function main() {
  const email=argument('--email').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Usage: npm run bootstrap:admin -- --email you@example.com --name "Administrator name" --institution "Institution"');
  const env={...process.env,...loadEnv('development',process.cwd(),'')}; const {admin}=serverClients(env);
  const settings=await admin.from('workspace_settings').select('id').eq('id',true).single(); managementError(settings.error);
  // Locate existing Auth accounts as well as profiles; never reset their password.
  let existingId='';
  for (let page=1;;page++) {
    const result=await admin.auth.admin.listUsers({page,perPage:500});
    if(result.error) throw new Error('Existing accounts could not be checked. Please retry.');
    const existing=result.data.users.find(user=>user.email?.toLowerCase()===email);
    if(existing){existingId=existing.id;break;}
    if(result.data.users.length<500)break;
  }
  if(existingId){const result=await admin.rpc('workspace_bootstrap_admin',{p_user_id:existingId});managementError(result.error);console.log('Existing account promoted to administrator. Sign in with its current password, or use Forgot password.');return;}
  const result=await createManagedAccount({email,full_name:argument('--name') || 'Placewise Administrator',college:argument('--institution') || 'Placewise',role:'admin',can_mentor:true,department:''},null,env);
  console.log(result.message);
}
void main().catch(cause=>{console.error(cause instanceof Error?cause.message:'Administrator setup failed.');process.exitCode=1;});
