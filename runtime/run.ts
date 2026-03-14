import { parse } from "../parser";
import { Runtime } from "./Runtime";
import test from './test.mylang' with { type: "text" };

const module = parse(test, "test.mylang");
const runtime = new Runtime();

runtime.runModule(module);
