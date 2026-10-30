// Every SRD 5.2.1 catalog entry. Loaded as its own chunk (catalog/load.ts), never by the main bundle's first parse.
import type { Entry } from '../../catalog/schema';
import classes from './classes.json';
import items from './items.json';
import origins from './origins.json';
import profs from './profs.json';
import rules from './rules.json';
import spells from './spells.json';

export default [...spells, ...items, ...origins, ...classes, ...rules, ...profs] as Entry[];
