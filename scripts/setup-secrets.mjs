import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import {passwordHash} from '../lib/domain.mjs';
fs.mkdirSync('.vercel',{recursive:true});
fs.writeFileSync('.vercel/project.json',JSON.stringify({projectId:'prj_3SjQgbCkxA9DdfmWF0jkCO38SiSe',orgId:'team_sML1HngfzbFwKnBhGMGnXoVX',projectName:'stas-good-day'}));
if(!fs.existsSync('.env.local')){
 const password=randomBytes(18).toString('base64url');
 const values={SESSION_SECRET:randomBytes(32).toString('base64url'),ADMIN_PASSWORD_HASH:passwordHash(password),APP_ORIGIN:'https://stas-good-day.vercel.app',BIRTHDAY_DATA_NAMESPACE:'birthday-qa'};
 fs.writeFileSync('.env.local',Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
 fs.writeFileSync('admin-access.txt','Кабинет Стаса: https://stas-good-day.vercel.app/#admin\nПароль: '+password+'\n\nНе отправляй этот файл гостям.\n',{mode:0o600});
}
console.log('Project linked; local secrets prepared without displaying values.');
