// Account storage was not included in the recovered source. Never simulate a signed-in user.
export async function GET() {return Response.json({error:"Account sync is not configured. Class names can be saved on this device."},{status:401,headers:{"Cache-Control":"private, no-store"}});}
