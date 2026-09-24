const target = process.argv[2];
const run = async () => {
  const base = new URL(target);
  if (base.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(base.hostname)) throw Error('Use public HTTPS.');
  for (const route of ['/health','/ready','/api/config','/']) {
    const response = await fetch(new URL(route,base),{ signal:AbortSignal.timeout(15000),redirect:'error' });
    if (!response.ok) throw Error('Failed: ' + route + ' HTTP ' + response.status);
    console.log('PASS ' + route);
  }
  const denied = await fetch(new URL('/api/v1/consents',base));
  if (denied.status !== 401) throw Error('Unauthenticated consent read must be rejected.');
  console.log('PASS unauthenticated consent read rejected');
};
run().catch(error=>{console.error(error.message);process.exitCode=1;});

