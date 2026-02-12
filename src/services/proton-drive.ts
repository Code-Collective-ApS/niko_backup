//
//
// THIS LIBRARY IS STILL TO NEW AND UNUSABLE AT THE MOMENT (2026-02-12)
//
//
// import {
//   ProtonDriveClient,
//   type ProtonDriveHTTPClient,
//   MemoryCache,
//   OpenPGPCryptoWithCryptoProxy,
//   ProtonDriveAccount,

//   type ProtonDriveHTTPClientBlobRequest,
//   ProtonDriveConfig,
// } from "@protontech/drive-sdk";

// import {
//   type SRPModule
// } from "@protontech/drive-sdk/src/crypto";

// const httpClient: ProtonDriveHTTPClient = {
//   fetchBlob: async (r) => {
//     return new Response(r.body, {
//       headers: r.headers,
//       status: 200,
//     });
//   },
//   fetchJson: async (r) => {
//     return new Response(JSON.stringify(r.json), {
//       headers: r.headers,
//       status: 200,
//     });
//   },
// };

// const config: ProtonDriveConfig = {  };

// const sdk = new ProtonDriveClient({
//   httpClient,
//   entitiesCache: new MemoryCache(),
//   cryptoCache: new MemoryCache(),
//   account,
//   openPGPCryptoModule: new OpenPGPCryptoWithCryptoProxy({ }),
//   srpModule: new srpMo
// });
//
