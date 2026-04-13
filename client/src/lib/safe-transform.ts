function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (bracketMatch) {
      current = current[bracketMatch[1]];
      if (!Array.isArray(current)) return undefined;
      current = current[parseInt(bracketMatch[2], 10)];
    } else {
      current = current[part];
    }
  }

  return current;
}

interface MapOperation {
  type: 'map';
  source: string;
  fields: Record<string, string>;
}

interface PickOperation {
  type: 'pick';
  path: string;
}

interface RenameOperation {
  type: 'rename';
  mappings: Record<string, string>;
}

interface WrapOperation {
  type: 'wrap';
  key: string;
}

interface UnwrapOperation {
  type: 'unwrap';
  path: string;
}

interface PipelineOperation {
  type: 'pipeline';
  steps: TransformOperation[];
}

type TransformOperation = MapOperation | PickOperation | RenameOperation | WrapOperation | UnwrapOperation | PipelineOperation;

function parseTransformExpression(expr: string): TransformOperation | null {
  const trimmed = expr.trim();

  const pickMatch = trimmed.match(/^pick\s*\(\s*["'](.+?)["']\s*\)$/i);
  if (pickMatch) {
    return { type: 'pick', path: pickMatch[1] };
  }

  const unwrapMatch = trimmed.match(/^unwrap\s*\(\s*["'](.+?)["']\s*\)$/i);
  if (unwrapMatch) {
    return { type: 'unwrap', path: unwrapMatch[1] };
  }

  const wrapMatch = trimmed.match(/^wrap\s*\(\s*["'](\w+)["']\s*\)$/i);
  if (wrapMatch) {
    return { type: 'wrap', key: wrapMatch[1] };
  }

  const mapMatch = trimmed.match(/^map\s*\(\s*["'](.+?)["']\s*,\s*\{([\s\S]+)\}\s*\)$/i);
  if (mapMatch) {
    const source = mapMatch[1];
    const fieldsStr = mapMatch[2];
    const fields: Record<string, string> = {};

    const fieldPairs = fieldsStr.split(',');
    for (const pair of fieldPairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const key = pair.substring(0, colonIdx).trim().replace(/^["']|["']$/g, '');
      const val = pair.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val) {
        fields[key] = val;
      }
    }

    return { type: 'map', source, fields };
  }

  const renameMatch = trimmed.match(/^rename\s*\(\s*\{([\s\S]+)\}\s*\)$/i);
  if (renameMatch) {
    const mappingsStr = renameMatch[1];
    const mappings: Record<string, string> = {};

    const pairs = mappingsStr.split(',');
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const key = pair.substring(0, colonIdx).trim().replace(/^["']|["']$/g, '');
      const val = pair.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val) {
        mappings[key] = val;
      }
    }

    return { type: 'rename', mappings };
  }

  return null;
}

function executeOperation(data: any, op: TransformOperation): any {
  switch (op.type) {
    case 'pick':
      return getNestedValue(data, op.path);

    case 'unwrap':
      return getNestedValue(data, op.path);

    case 'wrap':
      return { [op.key]: data };

    case 'map': {
      const sourceArray = getNestedValue(data, op.source);
      if (!Array.isArray(sourceArray)) return data;
      return sourceArray.map((item: any) => {
        const result: Record<string, any> = {};
        for (const [targetField, sourcePath] of Object.entries(op.fields)) {
          result[targetField] = getNestedValue(item, sourcePath);
        }
        return result;
      });
    }

    case 'rename': {
      if (Array.isArray(data)) {
        return data.map((item: any) => {
          if (typeof item !== 'object' || item === null) return item;
          const result: Record<string, any> = { ...item };
          for (const [oldKey, newKey] of Object.entries(op.mappings)) {
            if (oldKey in result) {
              result[newKey] = result[oldKey];
              delete result[oldKey];
            }
          }
          return result;
        });
      }
      if (typeof data === 'object' && data !== null) {
        const result: Record<string, any> = { ...data };
        for (const [oldKey, newKey] of Object.entries(op.mappings)) {
          if (oldKey in result) {
            result[newKey] = result[oldKey];
            delete result[oldKey];
          }
        }
        return result;
      }
      return data;
    }

    case 'pipeline': {
      let result = data;
      for (const step of op.steps) {
        result = executeOperation(result, step);
      }
      return result;
    }

    default:
      return data;
  }
}

export function safeTransform(data: any, expression: string): any {
  if (!expression || !expression.trim()) return data;

  const lines = expression.split(/\s*\|\s*|\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) return data;

  if (lines.length === 1) {
    const op = parseTransformExpression(lines[0]);
    if (!op) {
      console.warn('Unrecognized transformation expression:', lines[0]);
      return data;
    }
    return executeOperation(data, op);
  }

  const steps: TransformOperation[] = [];
  for (const line of lines) {
    const op = parseTransformExpression(line);
    if (op) {
      steps.push(op);
    } else {
      console.warn('Skipping unrecognized transformation step:', line);
    }
  }

  if (steps.length === 0) return data;

  return executeOperation(data, { type: 'pipeline', steps });
}
