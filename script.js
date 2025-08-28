document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const connectButton = document.getElementById('connectButton');
    const statusDisplay = document.getElementById('status');
    const fileListContainer = document.getElementById('fileListContainer');
    const fileListDisplay = document.getElementById('fileList');
    const fileContentContainer = document.getElementById('fileContentContainer');
    const fileContentDisplay = document.getElementById('fileContent');
    const fileNameHeader = document.getElementById('fileNameHeader');
    const backButton = document.getElementById('backButton');

    // State
    let device;
    let currentAction = null; 
    
    // Constants
    const PICO_VENDOR_ID = 0x2e8a;
    const PICO_PRODUCT_ID = 0x0005;

    // Initial Checks
    if (!('usb' in navigator)) {
        statusDisplay.textContent = 'Error: WebUSB is not supported by your browser.';
        connectButton.disabled = true;
        return;
    }

    // Event Listeners
    connectButton.addEventListener('click', () => device ? disconnect() : connect());
    backButton.addEventListener('click', () => listFiles());

    // Core Functions
    async function connect() {
        try {
            device = await navigator.usb.requestDevice({
                filters: [{ vendorId: PICO_VENDOR_ID, productId: PICO_PRODUCT_ID }]
            });
            await device.open();
            await device.selectConfiguration(1);
            await device.claimInterface(0); 
            await device.claimInterface(1);

            statusDisplay.textContent = 'Status: Connected';
            connectButton.textContent = 'Disconnect';
            await listFiles();
        } catch (error) {
            statusDisplay.textContent = `Error: ${error.message}`;
            device = null;
        }
    }

    async function disconnect() {
        if (!device) return;
        try {
            await device.releaseInterface(1);
            await device.releaseInterface(0);
            await device.close();
        } catch (error) { console.error('Error during disconnect:', error); }
        
        device = null;
        statusDisplay.textContent = 'Status: Disconnected';
        connectButton.textContent = 'Connect to Pico';
        fileListDisplay.innerHTML = '';
        showFileListView();
    }

    async function sendCommand(command) {
        const data = new TextEncoder().encode(command + '\r\n');
        await device.transferOut(2, data); 
    }
    
    async function enterRawModeAndExecute(command) {
        if (!device) return;
        try {
            await sendCommand('\x01'); // Enter raw mode
            await sendCommand(command);
            await sendCommand('\x04'); // Soft reboot
            setTimeout(readResponse, 300);
        } catch (error) { statusDisplay.textContent = `Error: ${error.message}`; }
    }

    // Command Functions
    async function listFiles() {
        showFileListView();
        currentAction = 'list';
        fileListDisplay.innerHTML = '<em>Fetching file list...</em>';
        // A more robust command that joins filenames with a comma
        const command = "import os; print(','.join(os.listdir()))";
        await enterRawModeAndExecute(command);
    }

    async function readFile(filename) {
        showFileContentView();
        currentAction = 'read';
        fileNameHeader.textContent = filename;
        fileContentDisplay.textContent = `Reading '${filename}'...`;
        // Simple text-based read command
        const command = `
try:
    with open('${filename}', 'r') as f:
        print(f.read())
except Exception as e:
    print('###ERROR###:' + str(e))
`;
        await enterRawModeAndExecute(command);
    }
    
    // Response Handling
    async function readResponse() {
        try {
            let result = await device.transferIn(2, 4096);
            let text = new TextDecoder().decode(result.data);

            if (currentAction === 'list') {
                handleListResponse(text);
            } else if (currentAction === 'read') {
                handleFileResponse(text);
            }
        } catch (error) {
            if (!error.message.includes("timed out")) {
                 statusDisplay.textContent = `Error reading response: ${error.message}`;
            }
        } finally {
            currentAction = null; 
        }
    }

    function handleListResponse(text) {
        fileListDisplay.innerHTML = '';
        // Split by comma, then clean up any REPL artifacts from the first item
        const files = text.trim().split(',');
        const firstFile = files[0];
        const lastPromptIndex = firstFile.lastIndexOf('>');
        if (lastPromptIndex !== -1) {
            files[0] = firstFile.substring(lastPromptIndex + 1);
        }

        files.forEach(filename => {
            if (!filename) return;
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = filename.trim();
            link.addEventListener('click', (e) => {
                e.preventDefault();
                readFile(filename.trim());
            });
            fileListDisplay.appendChild(link);
        });
        statusDisplay.textContent = 'Status: Connected';
    }

    function handleFileResponse(text) {
        // Just display the whole raw output, as requested.
        fileContentDisplay.textContent = text;
        statusDisplay.textContent = 'Status: Displaying file content.';
    }

    // UI View Management
    function showFileListView() {
        fileContentContainer.classList.add('hidden');
        fileListContainer.classList.remove('hidden');
    }
    
    function showFileContentView() {
        fileListContainer.classList.add('hidden');
        fileContentContainer.classList.remove('hidden');
    }
});
