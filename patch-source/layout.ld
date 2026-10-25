SECTIONS {
 .menu 0xc26a : { *(.menu) }
 .text 0xf56a : { *(.text) }
 /DISCARD/ : { *(.comment) *(.note*) }
 ASSERT(SIZEOF(.menu) <= 280, "Menu table exceeds retired sequencer command tables")
 ASSERT(SIZEOF(.text) <= 1146, "Chop code overlaps next disk function")
}
