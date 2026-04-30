#!/usr/bin/env nu

mkdir .claude/rules
ls .cursor/rules/*.mdc | each { |f|
    let dest = $".claude/rules/($f.name | path basename | str replace '.mdc' '.md')"
    cp $f.name $dest
}