use node version installed with nvm

do not replace reports, but prepend to them with a date

always measure the impact of optimizations

keep interfaces minimal, including exports from modules. If an export is never used outside of the module, it should be private. 

when creating new ui components, use the ui kit
when there is no suitable ui kit component, create a new one and display it in the ui kit route
defer optional parameters as high as possible in hierarchy
if there is already a suitable utility function, use it