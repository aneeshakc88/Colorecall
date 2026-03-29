import https from 'https';
import fs from 'fs';

https.get('https://dialed.gg/', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    fs.writeFileSync('dialed.html', data);
    console.log('Saved to dialed.html');
  });
});
