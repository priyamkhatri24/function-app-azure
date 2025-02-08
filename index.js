const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");
const { AzureMonitorTraceExporter } = require("azure-monitor-opentelemetry");
const { TracerProvider } = require("@opentelemetry/sdk-trace-base");
const axios = require("axios");

const STORAGE_ACCOUNT = "your-storage-account";
const CONTAINER_NAME = "your-container-name";
const FOLDER_NAME = "your-folder-name/";
const CONNECTION_STRING = "your-storage-connection-string";
const CDN_PROFILE_NAME = "your-cdn-profile-name";
const CDN_ENDPOINT_NAME = "your-cdn-endpoint-name";
const RESOURCE_GROUP = "your-resource-group";
const SUBSCRIPTION_ID = "your-subscription-id";
const MONITOR_WORKSPACE_ID = "your-log-analytics-workspace-id";
const THRESHOLD_MB = 500; // Set a threshold in MB

// Initialize Azure Monitor Logging
const credential = new DefaultAzureCredential();
const exporter = new AzureMonitorTraceExporter({ credential });
const provider = new TracerProvider();
provider.addSpanProcessor(exporter);

async function getFolderSize() {
    const blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    let totalSize = 0;

    for await (const blob of containerClient.listBlobsFlat({ prefix: FOLDER_NAME })) {
        totalSize += blob.properties.contentLength;
    }

    return totalSize / (1024 * 1024); // Convert to MB
}

async function getCDNUsage() {
    const tokenResponse = await credential.getToken("https://management.azure.com/.default");
    const accessToken = tokenResponse.token;

    const response = await axios.get(
        `https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Cdn/profiles/${CDN_PROFILE_NAME}/endpoints/${CDN_ENDPOINT_NAME}/metrics?api-version=2020-09-01`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );

    let totalCDNData = 0;
    response.data.value.forEach((metric) => {
        if (metric.name.value === "TotalBytes") {
            totalCDNData += metric.timeseries[0].data[0].total;
        }
    });

    return totalCDNData / (1024 * 1024); // Convert to MB
}

async function logUsage() {
    const folderSize = await getFolderSize();
    const cdnUsage = await getCDNUsage();

    console.log(`Folder Size: ${folderSize} MB`);
    console.log(`CDN Usage: ${cdnUsage} MB`);

    if (folderSize > THRESHOLD_MB) {
        console.log(`⚠️ ALERT: Folder size exceeded ${THRESHOLD_MB} MB!`);
    }
}

module.exports = async function (context, myTimer) {
    await logUsage();
};