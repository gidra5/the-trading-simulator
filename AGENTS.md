use node version installed with nvm

do not replace reports, but prepend to them with a date

always measure the impact of optimizations

keep interfaces minimal, including exports from modules. If an export is never used outside of the module, it should be private. Also keep related items close to each other (same file, same module, same object, same folder, etc.)

when creating new ui components, use the ui kit
when there is no suitable ui kit component, create a new one and display it in the ui kit route
defer optional parameters as high as possible in hierarchy
if there is already a suitable utility function, use it

You don't need to be extremely defensive. Choose simple implementations that are easy to understand instead of fool-proof solutions, we don't need it to be perfect. This will be eventually rewritten, so it should just have a clear intent.

For finite enum/union values that map directly to labels, add translation keys for every value and derive the key from the value instead of writing a label switch. Example: use `t(``progression.status.${state}``)` for a typed `ProgressionNodeStatus`, with matching `progression.status.*` entries in the dictionary.
Only derive translation keys from closed, typed values controlled by the app. Do not interpolate arbitrary user input into translation keys.