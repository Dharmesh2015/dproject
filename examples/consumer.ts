// DProject — TypeScript consumer example.
//
// Verifies the public API surface compiles under TS. Run from the dproject/ root:
//   npx -y -p typescript tsc --noEmit --target es2020 --module commonjs \
//       --moduleResolution node --esModuleInterop --strict examples/consumer.ts
//
// (No tsc in this repo by design — DProject ships zero deps. CI can install it.)

import DProject, {
  Project,
  Task,
  Resource,
  Assignment,
  Predecessor,
  ProjectMeta,
  ISODate,
  Minutes,
  DependencyTypeName,
} from '../dproject';

const xml: string = '<Project xmlns="http://schemas.microsoft.com/project"><Name>x</Name></Project>';

// 1. Synchronous parse
const project: Project = DProject.parse(xml);

// 2. Use meta
const meta: ProjectMeta = project.meta;
const title: string = meta.title;
const minutesPerDay: Minutes = meta.minutesPerDay;
const startDate: ISODate | null = meta.startDate;

// 3. Iterate tasks
project.tasks.forEach((t: Task) => {
  const uid: number = t.uid;
  const name: string = t.name;
  const duration: Minutes = t.duration;
  const parent: number | null = t.parentUid;
  const isCritical: boolean = t.critical;

  // 4. Predecessors
  t.predecessors.forEach((p: Predecessor) => {
    const typeName: DependencyTypeName = p.typeName; // 'FF' | 'FS' | 'SF' | 'SS'
    const lag: Minutes = p.lag;
    const refUid: number = p.predecessorUid;
  });
});

// 5. Resources & assignments
const resources: Resource[] = project.resources;
const assignments: Assignment[] = project.assignments;

// 6. Async entrypoints
DProject.fromUrl('/file.xml').then((p: Project) => {
  console.log(p.tasks.length);
});

// 7. Validate
const result = DProject.validate(project);
if (!result.ok) {
  result.errors.forEach((e: { code: string; message: string }) => {
    console.error(e.code, e.message);
  });
}

// 8. Version is a string
const v: string = DProject.version;

export { project, resources, assignments };
