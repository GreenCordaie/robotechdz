const tenantId = "730d24b2-1a9b-4669-b614-fb73275da7b0";
const clientId = "72e03be8-0a78-4e03-8e47-ee2bb1600a09";
const redirectUri = "http://localhost:1556/api/auth/microsoft/callback";
const scopes = "offline_access Mail.Read";
const codeId = "344";

const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: scopes,
    state: codeId,
    prompt: "consent"
});

console.log(`URL OAUTH:\nhttps://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`);
