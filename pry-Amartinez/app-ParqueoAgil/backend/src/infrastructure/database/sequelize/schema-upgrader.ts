import { Logger } from '@nestjs/common';
import type { ModelAttributeColumnOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * Agrega a las tablas existentes las columnas nuevas de los modelos.
 *
 * `sequelize.sync({ alter: false })` crea las tablas que faltan pero no toca
 * las que ya existen, así que una base creada antes de la integración no
 * tendría, por ejemplo, `tickets.vehicleId`. Este paso compara cada modelo
 * con su tabla y agrega solo lo que falta (nunca borra ni modifica columnas),
 * por eso se puede ejecutar en cada arranque.
 *
 * Solo se agregan columnas que admiten NULL o tienen valor por defecto: una
 * columna obligatoria sin valor por defecto no se puede añadir a una tabla
 * con filas, y se avisa en el log para hacerlo a mano.
 */
export async function upgradeSchema(sequelize: Sequelize): Promise<void> {
  const logger = new Logger('SchemaUpgrader');
  const queryInterface = sequelize.getQueryInterface();

  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName() as string;
    const existing = await queryInterface.describeTable(table);
    const attributes = model.getAttributes() as Record<string, ModelAttributeColumnOptions & { field?: string }>;

    for (const [name, attribute] of Object.entries(attributes)) {
      const column = attribute.field ?? name;
      if (column in existing) continue;

      const optional = attribute.allowNull !== false || attribute.defaultValue !== undefined;
      if (!optional) {
        logger.warn(`Falta ${table}.${column} (obligatoria sin valor por defecto): agréguela a mano`);
        continue;
      }

      await queryInterface.addColumn(table, column, {
        type: attribute.type,
        allowNull: attribute.allowNull !== false,
        defaultValue: attribute.defaultValue,
      });
      logger.log(`Columna agregada: ${table}.${column}`);
    }
  }
}
