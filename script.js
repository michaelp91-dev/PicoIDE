document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const statusDisplay = document.getElementById('status');
    const fileListDisplay = document.getElementById('fileList');

    let device;
    const PICO_VENDOR_ID = 0x2e8a;
    const PICO_PRODUCT_ID = 0x0005;

    if (!('usb' in navigator)) {
        statusDisplay.textContent = 'Error: WebUSB is not supported by your browser.';
        connectButton.disabled = true;
        return;
    }

    connectButton.addEventListener('click', async () => {
        if (device) {
            await disconnect();
        } else {
            await connect();
        }
    });

    async function connect() {
        try {
            device = await navigator.usb.requestDevice({
                filters: [{ vendorId: PICO_VENDOR_ID, productId: PICO_PRODUCT_ID }]
            });

            await device.open();
            await device.selectConfiguration(1);
            
            // NEW STRATEGY: Claim both the control and data interfaces.
            // Interface 0 is the control interface for the serial connection.
            await device.claimInterface(0); 
            // Interface 1 is the data interface. This is where the error was.
            await device.claimInterface(1);

            statusDisplay.textContent = 'Status: Connected';
            connectButton.textContent = 'Disconnect';
            fileListDisplay.textContent = 'Fetching file list...';

            await listFiles();
        } catch (error) {
            statusDisplay.textContent = `Error: ${error.message}`;
            // If connection fails, reset device variable
            device = null;
        }
    }

    async function disconnect() {
        if (device) {
            try {
                // Release interfaces in reverse order of claiming.
                await device.releaseInterface(1);
                await device.releaseInterface(0);
                await device.close();
            } catch (error) {
                console.error('Error during disconnect:', error);
            }
        }
        device = null;
        statusDisplay.textContent = 'Status: Disconnected';
        connectButton.textContent = 'Connect to Pico';
        fileListDisplay.textContent = '';
    }

    async function sendCommand(command) {
        const data = new TextEncoder().encode(command + '\r\n');
        await device.transferOut(2, data); 
    }

    async function listFiles() {
        if (!device) return;

        try {
            const enterRawMode = '\x01';
            const listFilesCommand = "import os; print(os.listdir())";
            const exitRawMode = '\x04';

            await sendCommand(enterRawMode);
            await sendCommand(listFilesCommand);
            await sendCommand(exitRawMode);

            setTimeout(readResponse, 200);

        } catch (error) {
            statusDisplay.textContent = `Error sending command: ${error.message}`;
        }
    }
    
    async function readResponse() {
        try {
            let result = await device.transferIn(2, 512);
            let text = new TextDecoder().decode(result.data);
            
            const fileArray = text.match(/\['.*'\]/);
            if(fileArray) {
                fileListDisplay.textContent = JSON.parse(fileArray[0].replace(/'/g, '"')).join('\n');
            } else {
                fileListDisplay.textContent = "Could not parse file list. Raw output:\n" + text;
            }

        } catch (error) {
            if (error.message.includes("timed out")) {
                 fileListDisplay.textContent = "No response from Pico. Try reconnecting.";
            } else {
                 statusDisplay.textContent = `Error reading response: ${error.message}`;
            }
        }
    }
});
