export class FakeD1Database {
  constructor(database) {
    this.database = database;
    this.beforeRun = null;
    this.batchTail = Promise.resolve();
  }

  prepare(sql) {
    return new FakeD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    const execute = async () => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        this.database.exec("COMMIT");
        return results;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
    const pending = this.batchTail.then(execute, execute);
    this.batchTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
}

class FakeD1PreparedStatement {
  constructor(owner, sql, params = []) {
    this.owner = owner;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new FakeD1PreparedStatement(this.owner, this.sql, params);
  }

  async first() {
    return this.owner.database.prepare(this.sql).get(...this.params) ?? null;
  }

  async all() {
    return {
      results: this.owner.database.prepare(this.sql).all(...this.params),
      success: true,
      meta: {},
    };
  }

  async run() {
    await this.owner.beforeRun?.({ params: this.params, sql: this.sql });
    const result = this.owner.database.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: result.lastInsertRowid,
      },
    };
  }
}
