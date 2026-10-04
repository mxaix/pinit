// Run interactively on your own machine. The password is never echoed or stored.
import crypto from 'node:crypto';
if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal');
process.stdout.write('New admin password (at least 16 characters): ');
process.stdin.setRawMode(true);process.stdin.resume();
let password='';
process.stdin.on('data',data=>{
 for(const c of data.toString()) {
  if(c==='\u0003') process.exit(1);
  if(c==='\r'||c==='\n') {
   process.stdin.setRawMode(false);process.stdout.write('\n');
   if(password.length<16) { console.error('Password too short');process.exit(1); }
   const salt=crypto.randomBytes(16).toString('hex');
   const hash=crypto.scryptSync(password,salt,64).toString('hex');
   console.log(`ADMIN_PASSWORD_SCRYPT=${salt}:${hash}`);process.exit(0);
  }
  if(c==='\u007f'||c==='\b') password=password.slice(0,-1);else password+=c;
 }
});
