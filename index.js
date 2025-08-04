const express = require('express');
const cors = require('cors');
const { Connection, Request } = require('tedious');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Database connection configuration
// The connection string is read from an environment variable set in Azure App Service
const connectionString = process.env.DefaultConnection;

// Function to connect to the database
function getDbConnection() {
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
            rowCollectionOnRequestCompletion: true
        }
    };

    // Parse the connection string
    connectionString.split(';').forEach(part => {
        const [key, value] = part.split('=');
        if (key.toLowerCase() === 'server') config.server = value.replace('tcp:', '');
        if (key.toLowerCase() === 'initial catalog') config.options.database = value;
        if (key.toLowerCase() === 'user id') config.authentication.options.userName = value;
        if (key.toLowerCase() === 'password') config.authentication.options.password = value;
    });

    return new Connection(config);
}

// API endpoint to handle form submissions
app.post('/api/contacts', (req, res) => {
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
        return res.status(400).send('All fields are required.');
    }

    const connection = getDbConnection();

    connection.on('connect', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Database connection error.');
        }

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
                console.error(err.message);
                return res.status(500).send('Error executing query.');
            }
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
