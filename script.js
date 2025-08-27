document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const statusDisplay = document.getElementById('status');
    const fileListDisplay = document.getElementById('fileList');

    let device;
    const PICO_VENDOR_ID = 0x2e8a;
    const PICO_PRODUCT_ID = 0x0005;

    // Check if WebUSB is supported by the browser
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
            // Request permission to connect to the Pico
            device = await navigator.usb.requestDevice({
                filters: [{ vendorId: PICO_VENDOR_ID, productId: PICO_PRODUCT_ID }]
            });

            await device.open();
            await device.selectConfiguration(1);
            // The REPL is usually on interface 2
            await device.claimInterface(2); 

            statusDisplay.textContent = 'Status: Connected';
            connectButton.textContent = 'Disconnect';
            fileListDisplay.textContent = 'Fetching file list...';

            await listFiles();
        } catch (error) {
            statusDisplay.textContent = `Error: ${error.message}`;
        }
    }

    async function disconnect() {
        if (device) {
            try {
                await device.close();
            } catch (error) {
                console.error('Error closing device:', error);
            }
        }
        device = null;
        statusDisplay.textContent = 'Status: Disconnected';
        connectButton.textContent = 'Connect to Pico';
        fileListDisplay.textContent = '';
    }

    async function sendCommand(command) {
        // Append newline character to execute the command in REPL
        const data = new TextEncoder().encode(command + '\r\n');
        // The endpoint number 4 is typically the OUT endpoint for the REPL
        await device.transferOut(4, data); 
    }

    async function listFiles() {
        if (!device) return;

        try {
            // Commands to enter raw mode, list files, and exit raw mode
            const enterRawMode = '\x01'; // Ctrl+A
            const listFilesCommand = "import os; print(os.listdir())";
            const exitRawMode = '\x04'; // Ctrl+D would also work here to soft reboot and show output

            await sendCommand(enterRawMode);
            await sendCommand(listFilesCommand);
            await sendCommand(exitRawMode);

            // Give Pico a moment to process and respond
            setTimeout(readResponse, 200);

        } catch (error) {
            statusDisplay.textContent = `Error sending command: ${error.message}`;
        }
    }
    
    async function readResponse() {
        try {
            // The endpoint number 4 is also the IN endpoint here
            let result = await device.transferIn(4, 512); // Read up to 512 bytes
            let text = new TextDecoder().decode(result.data);
            
            // Clean up the raw output from the REPL
            const fileArray = text.match(/\['.*'\]/);
            if(fileArray) {
                fileListDisplay.textContent = JSON.parse(fileArray[0].replace(/'/g, '"')).join('\n');
            } else {
                fileListDisplay.textContent = "Could not parse file list. Raw output:\n" + text;
            }

        } catch (error) {
            // Ignore timeout errors which can happen if there's no data
            if (error.message.includes("timed out")) {
                 fileListDisplay.textContent = "No response from Pico. Try reconnecting.";
            } else {
                 statusDisplay.textContent = `Error reading response: ${error.message}`;
            }
        }
    }
});
