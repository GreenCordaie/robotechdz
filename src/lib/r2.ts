import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const r2Config = {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.R2_BUCKET_NAME || "",
    publicUrl: process.env.R2_PUBLIC_URL || "", // e.g., https://pub-xyz.r2.dev
    endpoint: process.env.R2_ENDPOINT || "", // e.g., https://<accountid>.r2.cloudflarestorage.com
};

const s3Client = new S3Client({
    region: "auto",
    endpoint: r2Config.endpoint,
    credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
    },
    // Cloudflare R2 rejects the CRC32 integrity checksums that @aws-sdk/client-s3
    // (>= 3.729) adds to PutObject by default — uploads fail with a checksum/
    // "not implemented" error. Opt out so a checksum is only sent when an
    // operation strictly requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
});

export async function uploadToR2(buffer: Buffer, fileName: string, contentType: string) {
    if (!r2Config.bucketName) {
        throw new Error("R2_BUCKET_NAME is not configured");
    }

    const command = new PutObjectCommand({
        Bucket: r2Config.bucketName,
        Key: fileName,
        Body: buffer,
        ContentType: contentType,
    });

    await s3Client.send(command);

    // Return the public URL
    const baseUrl = r2Config.publicUrl.endsWith("/")
        ? r2Config.publicUrl.slice(0, -1)
        : r2Config.publicUrl;

    return `${baseUrl}/${fileName}`;
}

export const isR2Configured = !!(
    r2Config.accessKeyId &&
    r2Config.secretAccessKey &&
    r2Config.bucketName &&
    r2Config.endpoint
);
