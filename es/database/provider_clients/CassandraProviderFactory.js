

/**
 * Construct the CassandraProvider. Wait for the client to connect and then instantiate
 * the provider
 */
let CassandraFactory = (() => {
  var _ref = _asyncToGenerator(function* (server, database) {
    const dbConfig = configDatabase(server, database);
    const logger = createLogger('db:clients:cassandra');

    logger().debug('creating database client %j', dbConfig);
    const client = new Client(dbConfig);

    logger().debug('connecting');
    yield client.connect();

    return new CassandraProvider(server, database, client);
  });

  return function CassandraFactory(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

/* eslint-disable */
// @TODO: Add flow annotation
import { Client } from 'cassandra-driver';
import { identify } from 'sql-query-identifier';
import BaseProvider from './BaseProvider';
import createLogger from '../../Logger';


class CassandraProvider extends BaseProvider {

  constructor(server, database, connection) {
    super(server, database);
    this.connection = connection;
  }

  disconnect() {
    this.connection.shutdown();
  }

  listTables(database) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT table_name as name
        FROM system_schema.tables
        WHERE keyspace_name = ?
      `;
      const params = [database];
      this.connection.execute(sql, params, (err, data) => {
        if (err) return reject(err);
        return resolve(data.rows.map(row => ({ name: row.name })));
      });
    });
  }

  listViews() {
    return Promise.resolve([]);
  }

  listRoutines() {
    return Promise.resolve([]);
  }

  listTableColumns(database, table) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT position, column_name, type
        FROM system_schema.columns
        WHERE keyspace_name = ?
          AND table_name = ?
      `;
      const params = [database, table];
      this.connection.execute(sql, params, (err, data) => {
        if (err) return reject(err);
        return resolve(data.rows
        // force pks be placed at the results beginning
        .sort((a, b) => b.position - a.position).map(row => ({
          columnName: row.column_name,
          dataType: row.type
        })));
      });
    });
  }

  listTableTriggers() {
    return Promise.resolve([]);
  }
  listTableIndexes() {
    return Promise.resolve([]);
  }

  listSchemas() {
    return Promise.resolve([]);
  }

  getTableReferences() {
    return Promise.resolve([]);
  }

  getTableColumns(database, table) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT column_name
        FROM system_schema.columns
        WHERE keyspace_name = ?
          AND table_name = ?
          AND kind = 'partition_key'
        ALLOW FILTERING
      `;
      const params = [database, table];

      this.connection.execute(sql, params, (err, data) => {
        if (err) return reject(err);
        return resolve(data.rows.map(row => ({
          constraintName: null,
          columnName: row.column_name,
          referencedTable: null,
          keyType: 'PRIMARY KEY'
        })));
      });
    });
  }

  getTableRows() {
    return Promise.resolve([]);
  }

  query() {
    throw new Error('"query" is not implementd by cassandra this.connection.');
  }

  // @TODO
  insert(database, table, objectToInsert) {
    return Promise.resolve([objectToInsert]);
  }

  executeQuery(queryText) {
    const commands = this.identifyCommands(queryText).map(item => item.type);

    return new Promise((resolve, reject) => {
      this.connection.execute(queryText, (err, data) => {
        if (err) return reject(err);
        return resolve([this.parseRowQueryResult(data, commands[0])]);
      });
    });
  }

  listDatabases() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT keyspace_name FROM system_schema.keyspaces';
      const params = [];
      this.connection.execute(sql, params, (err, data) => {
        if (err) return reject(err);
        return resolve(data.rows.map(row => row.keyspace_name));
      });
    });
  }

  getQuerySelectTop(table, limit) {
    return Promise.resolve(`SELECT * FROM ${this.wrapIdentifier(table)} LIMIT ${limit}`);
  }

  getTableCreateScript() {
    return Promise.resolve('');
  }

  getViewCreateScript() {
    return Promise.resolve('');
  }

  getRoutineCreateScript() {
    return Promise.resolve('');
  }

  wrapIdentifier(value) {
    if (value === '*') return value;
    const matched = value.match(/(.*?)(\[[0-9]\])/); // eslint-disable-line no-useless-escape
    if (matched) return this.wrapIdentifier(matched[1]) + matched[2];
    return `"${value.replace(/"/g, '""')}"`;
  }

  truncateAllTables(database) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const sql = `
      SELECT table_name
      FROM system_schema.tables
      WHERE keyspace_name = '${database}'
    `;
      const [result] = yield _this.executeQuery(sql);
      const tables = result.rows.map(function (row) {
        return row.table_name;
      });
      const promises = tables.map(function (t) {
        const truncateSQL = `
      TRUNCATE TABLE ${_this.wrapIdentifier(database)}.${_this.wrapIdentifier(t)};
    `;
        return _this.executeQuery(truncateSQL);
      });

      return Promise.all(promises);
    })();
  }

  parseRowQueryResult(data, command) {
    // Fallback in case the identifier could not reconize the command
    const isSelect = command ? command === 'SELECT' : Array.isArray(data.rows);
    return {
      command: command || isSelect && 'SELECT',
      rows: data.rows || [],
      fields: data.columns || [],
      rowCount: isSelect ? data.rowLength || 0 : undefined,
      affectedRows: !isSelect && !isNaN(data.rowLength) ? data.rowLength : undefined
    };
  }

  identifyCommands(queryText) {
    try {
      return identify(queryText);
    } catch (err) {
      return [];
    }
  }
}

function configDatabase(server, database) {
  const config = {
    contactPoints: [server.config.host],
    protocolOptions: {
      port: server.config.port
    },
    keyspace: database.database
  };

  if (server.sshTunnel) {
    config.contactPoints = [server.config.localHost];
    config.protocolOptions.port = server.config.localPort;
  }

  if (server.config.ssl) {
    // TODO: sslOptions
  }

  return config;
}

export default CassandraFactory;
//# sourceMappingURL=CassandraProviderFactory.js.map