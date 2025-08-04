const express = require('express');
const cors = require('cors');
const { Connection, Request } = require('tedious');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Database connection configuration
// Check for the Azure-specific prefixed variable first, then fall back to the plain name.
const connectionString = process.env.SQLAZURECONNSTR_DefaultConnection || process.env.DefaultConnection;

// Function to connect to the database
function getDbConnection() {
    console.log("Attempting to parse connection string...");
    if (!connectionString) {
        console.error("FATAL: Connection string environment variable not set.");
        return null;
    }

    const config = {
        server: '',
        authentication: {
            type: 'default',
            options: {
                userName: '',
                password: ''
            }
        },
        options: {
            database: '',
            encrypt: true,
            rowCollectionOnRequestCompletion: true,
            port: 1433 // Default SQL Server port
        }
    };

    // Parse the connection string
    connectionString.split(';').forEach(part => {
        const [key, value] = part.split('=');
        if (key && value) {
            if (key.toLowerCase() === 'server' || key.toLowerCase() === 'data source') {
                // Remove tcp: prefix and extract server name and port
                let serverValue = value.replace('tcp:', '');
                
                // Check if port is specified
                if (serverValue.includes(',')) {
                    const [serverName, portStr] = serverValue.split(',');
                    config.server = serverName;
                    config.options.port = parseInt(portStr) || 1433;
                } else {
                    config.server = serverValue;
                }
            }
            if (key.toLowerCase() === 'initial catalog' || key.toLowerCase() === 'database') {
                config.options.database = value;
            }
            if (key.toLowerCase() === 'user id' || key.toLowerCase() === 'uid') {
                config.authentication.options.userName = value;
            }
            if (key.toLowerCase() === 'password' || key.toLowerCase() === 'pwd') {
                config.authentication.options.password = value;
            }
        }
    });

    console.log(`Parsed config: Server=${config.server}, Port=${config.options.port}, DB=${config.options.database}, User=${config.authentication.options.userName}`);
    return new Connection(config);
}

// API endpoint to handle form submissions
app.post('/api/contacts', (req, res) => {
    console.log("Received POST request on /api/contacts");
    const { name, email, phone } = req.body;
    console.log("Request body:", req.body);

    if (!name || !email || !phone) {
        console.error("Validation failed: Missing fields.");
        return res.status(400).send('All fields are required.');
    }

    const connection = getDbConnection();
    if (!connection) {
        return res.status(500).send('Server configuration error: Missing connection string.');
    }

    connection.on('connect', (err) => {
        if (err) {
            console.error("Database connection failed:", err.message);
            return res.status(500).send('Database connection error.');
        }

        console.log("Database connected successfully. Executing SQL...");

        // SQL to insert data into the Contacts table
        const sql = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Contacts' and xtype='U')
            CREATE TABLE Contacts (
                ID int NOT NULL IDENTITY(1,1) PRIMARY KEY,
                Name varchar(255),
                Email varchar(255),
                Phone varchar(50)
            );
            INSERT INTO Contacts (Name, Email, Phone) VALUES (@Name, @Email, @Phone);
        `;

        const request = new Request(sql, (err) => {
            if (err) {
                console.error("SQL query execution failed:", err.message);
                return res.status(500).send('Error executing query.');
            }
            console.log("SQL query executed successfully.");
            res.status(200).send('Contact added successfully.');
            connection.close();
        });

        request.addParameter('Name', require('tedious').TYPES.NVarChar, name);
        request.addParameter('Email', require('tedious').TYPES.NVarChar, email);
        request.addParameter('Phone', require('tedious').TYPES.NVarChar, phone);

        connection.execSql(request);
    });

    connection.connect();
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
