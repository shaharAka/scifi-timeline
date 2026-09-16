#!/usr/bin/env python3
"""
Prototype: does a structured MOMENT SIGNATURE separate what a single bin
conflates, and join what a single bin keeps apart?

Thirty hard cases, real and fictional, faceted by hand. Nearest neighbours by
weighted facet similarity. Expected joins and expected separations at the
bottom; the script reports which hold.

    python3 tools/prototype-facets.py
"""
import itertools, math

MECH = ["law","coup","election","uprising","invention","discovery","accident","disaster",
        "attack","invasion","negotiation","disclosure","arrival","war"]
ACTOR = ["state","faction","individual","corporation","machine","nature","outsider","movement"]
POS = ["inside","below","outside","above"]          # where the actor stands relative to the order it changes
SCOPE = ["local","national","civilisational","planetary","beyond"]
DOMAIN = ["political","military","technological","scientific","biological","economic","social","cosmic"]

def M(id_, bin_, change, mechanism, actor, position, scope, domain, power, openness, capability, population, pre, out):
    return dict(id=id_, bin=bin_, change=change, mechanism=mechanism, actor=actor, position=position,
                scope=scope, domain=domain, dir=(power, openness, capability, population),
                pre=set(pre), out=set(out))

E = [
# --- power is seized, three ways
M("fl-hitler-seizes-power","power-seized","democracy → dictatorship","law","individual","inside","national","political",+1,-1,0,0,
  ["crisis-economic","street-violence","weak-institutions"],["one-party-state","purge","war-of-expansion"]),
M("REAL iran-1979","power-seized","monarchy → theocracy","uprising","movement","below","national","political",+1,-1,0,0,
  ["crisis-legitimacy","foreign-backed-ruler","repression"],["theocracy","purge","war-with-neighbour","hostility-abroad"]),
M("sw-order-66","power-seized","republic → empire","coup","individual","inside","civilisational","political",+1,-1,0,0,
  ["long-war","manufactured-emergency","weak-institutions"],["one-party-state","purge","war-of-expansion"]),
M("dune-paul-emperor","power-seized","empire → messianic rule","uprising","movement","below","civilisational","political",+1,-1,0,-1,
  ["crisis-legitimacy","occupation","prophecy"],["theocracy","holy-war","mass-death"]),
M("wh40k-age-of-apostasy","power-seized","empire → personal theocracy","coup","individual","inside","civilisational","political",+1,-1,0,-1,
  ["weak-institutions","religious-fervour"],["theocracy","civil-war","purge"]),
# --- the ruled rise
M("st-bell-riots","uprising","internment tolerated → internment ended","uprising","movement","below","national","social",-1,+1,0,0,
  ["crisis-economic","repression","segregation"],["reform"]),
M("pota-revolt-1991","uprising","slavery → apes take the cities","uprising","movement","below","civilisational","social",-1,+1,0,-1,
  ["slavery","dependency"],["civil-war","collapse"]),
M("sw-declaration-of-rebellion","uprising","scattered cells → open rebellion","negotiation","faction","below","civilisational","political",-1,+1,0,0,
  ["one-party-state","repression"],["civil-war"]),
M("dune-butlerian-jihad","uprising","machine rule → machines banned","uprising","movement","below","civilisational","technological",-1,-1,-1,-1,
  ["machine-dependency","crisis-legitimacy"],["taboo","new-order","mass-death"]),
M("REAL berlin-1989","uprising","one-party states → open borders","uprising","movement","below","national","political",-1,+1,0,0,
  ["crisis-economic","crisis-legitimacy","repression"],["reform","union","state-dissolves"]),
# --- voyages and technologies
M("REAL sputnik-1957","voyage-into-unknown","no object in orbit → one","invention","state","inside","planetary","technological",0,0,+1,0,
  ["rivalry","technological-race"],["arms-race","space-programme"]),
M("REAL apollo-1969","voyage-into-unknown","no human beyond Earth → Moon landing","invention","state","inside","planetary","technological",0,0,+1,0,
  ["rivalry","technological-race","prosperity"],["prestige","programme-winds-down"]),
M("interstellar-endurance","voyage-into-unknown","dying Earth → last mission leaves","arrival","state","inside","planetary","technological",0,0,+1,-1,
  ["existential-threat","crisis-ecological","secrecy"],["exodus","time-lost"]),
M("st-nx-01","voyage-into-unknown","home system → deep space","invention","state","inside","beyond","technological",0,+1,+1,0,
  ["prosperity","contact-made"],["diplomacy","union"]),
M("the-expanse-epstein-drive","new-technology-deployed","slow travel → continuous thrust","invention","individual","inside","planetary","technological",-1,+1,+1,+1,
  ["rivalry","dependency"],["independence","colonisation","gold-rush"]),
M("st-first-contact","first-contact","alone → met","invention","individual","inside","planetary","cosmic",0,+1,+1,0,
  ["collapse","post-war-ruin"],["contact","recovery","union"]),
# --- machines
M("term-judgment-day-1997","machine-awakens","defence network → self-aware, strikes","accident","machine","inside","planetary","technological",+1,-1,0,-1,
  ["arms-race","machine-dependency","secrecy"],["mass-death","war-of-annihilation"]),
M("matrix-renaissance-2090","machine-awakens","servant machines → their own nation","uprising","machine","below","planetary","social",-1,+1,+1,0,
  ["machine-dependency","repression"],["new-order","rivalry","war"]),
M("wh40k-cybernetic-revolt","machine-awakens","machine servants → revolt","uprising","machine","below","beyond","technological",-1,-1,-1,-1,
  ["machine-dependency","prosperity"],["collapse","taboo","mass-death"]),
# --- the economy breaks
M("tmithc-crash-1929","market-crash","boom → depression","disaster","nature","above","planetary","economic",0,-1,-1,0,
  ["prosperity","speculation"],["unemployment","radicalisation"]),
M("REAL crash-2008","market-crash","credit boom → financial crisis","disaster","corporation","inside","planetary","economic",0,-1,-1,0,
  ["prosperity","speculation","weak-regulation"],["bailouts","austerity","radicalisation"]),
# --- mass death
M("fo-great-war-2077","mass-death","cold war → two hours of nuclear exchange","war","state","inside","planetary","military",0,-1,-1,-1,
  ["long-war","resource-exhaustion","arms-race"],["collapse","shelter-society"]),
M("st-world-war-iii","mass-death","tension → nuclear, biological, genetic war","war","state","inside","planetary","military",0,-1,-1,-1,
  ["arms-race","weak-institutions"],["collapse","recovery"]),
M("REAL hiroshima-1945","doomsday-weapon","conventional war → atomic bomb used","attack","state","outside","planetary","military",+1,-1,+1,-1,
  ["long-war","technological-race","secrecy"],["surrender","arms-race","cold-war"]),
# --- secrets
M("hp-statute-of-secrecy","secret-kept","visible minority → hidden by law","law","faction","inside","planetary","social",0,-1,0,0,
  ["persecution"],["parallel-society","ignorance"]),
M("xf-syndicate","secret-kept","known threat → cabal keeps it","negotiation","faction","inside","planetary","political",+1,-1,0,0,
  ["existential-threat","contact-made"],["cover-up","collaboration"]),
M("REAL manhattan-project-1942","secret-kept","theory → secret weapons programme","law","state","inside","national","scientific",+1,-1,+1,0,
  ["long-war","technological-race","existential-threat"],["doomsday-weapon","secrecy-state"]),
# --- plague
M("children-of-men-infertility","plague","fertile → no births","disaster","nature","above","planetary","biological",0,-1,0,-1,
  [],["despair","closed-borders","extinction"]),
M("REAL covid-2020","plague","open world → pandemic","disaster","nature","above","planetary","biological",+1,-1,0,-1,
  ["global-travel"],["lockdown","state-powers","recovery"]),
M("tm-toll-1997","plague","released virus → five billion dead","attack","individual","inside","planetary","biological",0,-1,-1,-1,
  ["secrecy","fanaticism"],["collapse","shelter-society"]),
]

import sys
# --predictive: match on the SITUATION only (mechanism, actor, position, scope,
# domain, direction, preconditions) and leave the outcome out of the similarity,
# because the outcome is what we want to READ from the neighbours, not match on.
PREDICTIVE = "--predictive" in sys.argv
W = dict(mechanism=3, actor=2, position=2.5, domain=2, scope=1, dir=2.5, pre=2, out=(0 if PREDICTIVE else 2), change=0)
def jac(a,b): return len(a&b)/len(a|b) if (a|b) else 0
def cos(a,b):
    na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(x*x for x in b))
    return (sum(x*y for x,y in zip(a,b))/(na*nb)) if na and nb else 0
def sim(a,b):
    s = 0
    s += W["mechanism"]*(a["mechanism"]==b["mechanism"])
    s += W["actor"]*(a["actor"]==b["actor"])
    s += W["position"]*(a["position"]==b["position"])
    s += W["domain"]*(a["domain"]==b["domain"])
    s += W["scope"]*(1-abs(SCOPE.index(a["scope"])-SCOPE.index(b["scope"]))/4)
    s += W["dir"]*(cos(a["dir"],b["dir"])+1)/2
    s += W["pre"]*jac(a["pre"],b["pre"])
    s += W["out"]*jac(a["out"],b["out"])
    return s/sum(W.values())

by = {e["id"]:e for e in E}
print("mode:", "PREDICTIVE (outcome excluded from similarity)" if PREDICTIVE else "FULL (outcome included)")
print("nearest neighbours (facet similarity 0..1); [bin] shown to compare with the single-label view\n")
for e in E:
    nn = sorted(((sim(e,o),o) for o in E if o is not e), key=lambda t:-t[0])[:3]
    print("%-32s [%s]" % (e["id"], e["bin"]))
    for s,o in nn: print("      %.2f  %-32s [%s]" % (s, o["id"], o["bin"]))

JOIN = [("fl-hitler-seizes-power","sw-order-66"),("REAL iran-1979","dune-paul-emperor"),("REAL iran-1979","dune-butlerian-jihad"),
        ("st-bell-riots","REAL berlin-1989"),("REAL sputnik-1957","REAL apollo-1969"),("REAL sputnik-1957","the-expanse-epstein-drive"),
        ("term-judgment-day-1997","wh40k-cybernetic-revolt"),("tmithc-crash-1929","REAL crash-2008"),("fo-great-war-2077","st-world-war-iii"),
        ("xf-syndicate","REAL manhattan-project-1942"),("children-of-men-infertility","REAL covid-2020")]
SEP = [("fl-hitler-seizes-power","REAL iran-1979"),("REAL sputnik-1957","interstellar-endurance"),("st-bell-riots","dune-butlerian-jihad"),
       ("REAL hiroshima-1945","fo-great-war-2077"),("hp-statute-of-secrecy","REAL manhattan-project-1942"),("tm-toll-1997","REAL covid-2020")]
def rank(a,b):
    order = sorted((o for o in E if o is not by[a]), key=lambda o:-sim(by[a],o))
    return [o["id"] for o in order].index(b)+1
print("\nexpected JOINS (rank of b among a's neighbours; 1-3 = joined):")
for a,b in JOIN: print("  %-30s ~ %-30s rank %d  sim %.2f" % (a,b,rank(a,b),sim(by[a],by[b])))
print("\nexpected SEPARATIONS (same bin in the old view; rank > 3 = separated):")
for a,b in SEP: print("  %-30s x %-30s rank %d  sim %.2f" % (a,b,rank(a,b),sim(by[a],by[b])))
