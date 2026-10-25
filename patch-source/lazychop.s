| T11: native EPS-16 Plus OS 1.30 RAM overlay; 68000 only.
| Replaces COPY FLOPPY and overlapping BACKUP/RESTORE helpers.
| One mono WS / layer, start zero, forward-no-loop; sixteen slices.
| Source voice is selected from the native RAM descriptors, not ES STRT/END.
| Loop bounds match slice bounds; temporary root mapping supports repeat capture.
| Common note dispatch hooks cover local KPC and received MIDI.
| The saved D0 on the dispatcher stack identifies the release route;
| current D0 can already contain the editor-mode flag for local keys.
| Marker hooks never render the display: nonblocking task messages
| wake the original UI task, which renders the count in user context.
.cpu 68000
.text
.global _start, wave_preflight
_start:
    movem.l %d1-%d7/%a0-%a6,-(%sp)
    move.w 0x0b60.w,%d1
    cmpi.w #7,%d1
    bhi.w restore
    btst %d1,0x0a3c.w
    beq.w restore
    move.w %d1,0x098e.w
    move.w %d1,0x09a8.w
    jsr 0x87c6.w
    move.w 0x44(%a1),0x0990.w
    move.w 0x44(%a1),0x09aa.w
| Freshly loaded instruments can have WS=0 (no editor selection).
    move.w 0x46(%a1),%d0
    bne.s selected
    moveq #1,%d0
selected:
    move.w %d0,0x0992.w
    bsr.w source
    tst.l %d1
    beq.w restore
    movep.l 0xf0(%a1),%d0
    move.l %d0,points:w
    movep.l 0xf8(%a1),%d0
    cmp.l points:w,%d0
    bls.w restore
    move.l %d0,finish:w
    move.b 0xaa(%a1),root:w
    clr.w count:w
    clr.w committed:w
    clr.b status:w
    clr.w route:w
    move.w 0x0972.w,uitask:w
    cmpi.l #8192,0x0b00.w
    bcs.w restore
    move.w %sr,-(%sp)
    move.w #0x0700,%d0
    .word 0xa000
    move.w 0x20001e,-(%sp)
    moveq #19,%d0
quiet_scan:
    move.w %d0,0x20001e
    move.w 0x200000,%d1
    andi.w #3,%d1
    beq.s quiet_done
    dbra %d0,quiet_scan
quiet_done:
    move.w (%sp)+,0x20001e
    move.w (%sp)+,%d0
    .word 0xa000
    tst.w %d1
    beq.w restore
    bsr.w layer
    moveq #0,%d0
    move.b root:w,%d0
    add.w %d0,%d0
    lea 6(%a1,%d0.w),%a0
    move.l %a0,mapaddr:w
    move.b (%a0),savedmap:w
    move.b 0x0993.w,(%a0)
    move.l #0x4ef80000+onkey,0xa882.w
    move.l #0x4ef80000+offkey,0xa8a4.w
    not.w drawn:w
wait:
    move.w count:w,%d0
    cmp.w drawn:w,%d0
    beq.s get_message
    move.w %d0,drawn:w
    bsr.w render_ui
    jsr 0x26c6.w
get_message:
    trap #6
    jsr 0xc0867c
    cmpa.w #0x85fe,%a2
    bne.w wait
    cmpi.b #0x25,%d2
    beq.s commit
    cmpi.b #0x23,%d2
    bne.w wait
    bra.w cleanup
commit:
    tst.w committed:w
    bne.w restore
    cmpi.w #2,count:w
    bcc.s capture_valid
    move.b #0x4d,status:w
    bra.w wait
capture_valid:
    bsr.w unhook
    addq.w #1,committed:w
    clr.b 0x0a33.w
    clr.w %d7
allocate:
    cmp.w count:w,%d7
    bcc.s write_begin
    jsr 0xac34.w
    bcs.w failed
    lea ids,%a0
    move.w %d7,%d1
    move.b %d0,(%a0,%d1.w)
    addq.w #1,%d7
    bra.s allocate
write_begin:
    clr.w %d7
write_slice:
    bsr.w destination
    move.b root:w,%d0
    add.b %d7,%d0
    move.b %d0,0xaa(%a1)
    move.b %d0,0x112(%a1)
    move.b %d0,0x114(%a1)
    bsr.w name_chop
    bsr.w bounds
    movep.l %d4,0xf0(%a1)
    movep.l %d5,0xf8(%a1)
    movep.l %d4,0x100(%a1)
    movep.l %d5,0x108(%a1)
    addq.w #1,%d7
    cmp.w count:w,%d7
    bcs.s write_slice
    bsr.w layer
    exg %a0,%a1
    suba.l %a1,%a0
    jsr 0x8754.w
    move.b #0x56,status:w
    not.w drawn:w
    bra.w wait
failed:
    not.w drawn:w
    move.b #0x57,status:w
report:
    bra.w wait
name_chop:
| Write interleaved name bytes directly; no mutable menu text as a source.
    move.l #0x43484f50,%d0
    movep.l %d0,0x0a(%a1)
    move.l #0x20202020,%d0
    movep.l %d0,0x12(%a1)
    movep.l %d0,0x1a(%a1)
    moveq #0,%d0
    move.w %d7,%d0
    addq.w #1,%d0
    bsr.w decimal
    cmpi.w #0x3130,%d1
    bcc.s name_two
    move.b %d1,0x14(%a1)
    rts
name_two:
    movep.w %d1,0x14(%a1)
    rts
bounds:
    lea points,%a0
    move.w %d7,%d0
    lsl.w #2,%d0
    move.l (%a0,%d0.w),%d4
    move.l 4(%a0,%d0.w),%d5
    rts
| Follow native parameter-copy references to the complete backing wavesample.
source:
    jsr 0x87da.w
    move.w 0x0992.w,%d0
    bsr.s resolve
    moveq #0,%d0
    move.b 0x22(%a1),%d0
    beq.s source_done
    move.w %d0,0x0992.w
    bra.s source
source_done:
    rts
destination:
    lea ids,%a0
    move.w %d7,%d0
    moveq #0,%d6
    move.b (%a0,%d0.w),%d6
    jsr 0x87e0.w
    move.w %d6,%d0
resolve:
    jsr 0x86fa.w
    adda.l %d1,%a1
    rts
layer:
    jsr 0x87e0.w
    move.w 0x09aa.w,%d0
    jsr 0x871e.w
    movea.l %a1,%a0
    adda.l %d1,%a1
    rts
cleanup:
    tst.w committed:w
    bne.s restore
    bsr.w unhook
restore:
    movem.l (%sp)+,%d1-%d7/%a0-%a6
    suba.w %a2,%a2
    cmp.w %d0,%d0
    rts
unhook:
    movea.l mapaddr:w,%a0
    move.b savedmap:w,(%a0)
    move.l #0x4ef900c0,0xa882.w
    move.l #0x4ef900c0,0xa8a4.w
    move.l finish:w,%d0
    move.w count:w,%d1
    lsl.w #2,%d1
    lea points,%a0
    move.l %d0,(%a0,%d1.w)
    move.w route:w,%d0
    moveq #0,%d2
    move.b root:w,%d2
    moveq #1,%d1
    jsr 0xa888.w
    rts
onkey:
    tst.w count:w
    bne.s mark
    cmp.b root:w,%d2
    bne.w discard
    move.w 2(%sp),route:w
    addq.w #1,count:w
    bsr.w notify
    jmp 0xc09088
mark:
    movem.l %d0-%d4/%a0-%a1,-(%sp)
    move.w count:w,%d2
    cmpi.w #16,%d2
    bcc.w skip
    moveq #0,%d0
    move.b root:w,%d0
    add.w %d2,%d0
    cmpi.w #108,%d0
    bhi.w skip
    move.w %sr,-(%sp)
    ori.w #0x0700,%sr
    move.w 0x20001e,-(%sp)
| Resolve the actual source through the OS, then inspect its software voices.
    move.w %d2,-(%sp)
    bsr.w source
    move.w (%sp)+,%d2
    lea 0x0ca8.w,%a0
    move.w 0x0bca.w,%d4
scan:
    tst.b 0x0c(%a0)
    beq.s next_voice
    cmpa.l 0x16(%a0),%a1
    bne.s next_voice
    moveq #0,%d3
    move.b 0x0d(%a0),%d3
    move.w %d3,0x20001e
| Same accumulator read and backing-data base used by native playback.
    move.l 0x200014,%d0
    sub.l 0x1a(%a0),%d0
    andi.l #0x1ffffe00,%d0
    cmp.l finish:w,%d0
    bcc.s next_voice
    lsl.w #2,%d2
    lea points,%a0
    cmp.l -4(%a0,%d2.w),%d0
    bls.s read_done
    move.l %d0,(%a0,%d2.w)
    addq.w #1,count:w
    bra.s read_done
next_voice:
    lea 0x9a(%a0),%a0
    dbra %d4,scan
read_done:
    move.w (%sp)+,0x20001e
    move.w (%sp)+,%sr
skip:
    bsr.w notify
    movem.l (%sp)+,%d0-%d4/%a0-%a1
discard:
    movem.l (%sp)+,%d0-%d1
offkey:
    moveq #0,%d3
    rts
| Preserve native absolute writes to the original Wave descriptors.
wave_preflight:
    move.l %a3,-(%sp)
    adda.w #0x0260,%a3
    move.w %a3,-(%sp)
    movea.w 6(%a3),%a0
    jsr (%a0)
    move.l %a0,-(%sp)
    move.w %sr,-(%sp)
    movea.w 6(%sp),%a0
    movea.l 8(%sp),%a3
    move.l (%a0),(%a3)
    move.w 4(%a0),4(%a3)
    move.w (%sp)+,%ccr
    movea.l (%sp)+,%a0
    addq.l #2,%sp
    movea.l (%sp)+,%a3
    rts
decimal:
    divu.w #10,%d0
    addi.l #0x00300030,%d0
    move.w %d0,%d1
    lsl.w #8,%d1
    swap %d0
    move.b %d0,%d1
    rts
notify:
    movem.l %d0-%d3/%a0-%a2/%a5,-(%sp)
    trap #2
    bcs.s no_message
    clr.l 2(%a5)
    movea.w uitask:w,%a1
    trap #9
no_message:
    movem.l (%sp)+,%d0-%d3/%a0-%a2/%a5
    rts
.balign 2
status: .word 0
committed: .word 0
ids: .space 16
mapaddr: .long 0
savedmap: .word 0
route: .word 0
uitask: .word 0
root: .word 0
count: .word 0
drawn: .word 0
finish: .long 0
points: .space 68

.section .menu,"ax"
.global menu_table, lazy_row, disabled_row, unavailable, chop_title
menu_table:
    .space 210 | Original Wave rows are copied from the user-provided OS.
lazy_row:
    .word 0,0,0,0,_start,chop_title,0xa000
disabled_row:
    .word 0,0,0,0,unavailable,not_available,0xa000
unavailable:
    lea not_available,%a2
    cmp.w %d0,%d0
    rts
chop_title: .asciz "LAZY CHOP"
not_available: .asciz "UNAVAILABLE"

.text
render_ui:
    moveq #0,%d0
    move.w count:w,%d0
    bsr.w decimal
    move.w %d1,ui_count:w
    lea active,%a2
    move.b #0x4e,ui_state:w
    tst.w committed:w
    beq.s ui_ready
    move.b #0x4b,ui_state:w
ui_ready:
    cmpi.b #0x57,status:w
    bne.s ui_done
    lea failed_ui,%a2
ui_done:
    rts
    .byte 0
active: .ascii "CHOP O"
ui_state: .ascii "N! "
ui_count: .ascii "00/16"
    .byte 0
failed_ui: .asciz "CHOP FAILED"
.balign 2
