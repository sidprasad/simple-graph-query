# Forge Expression Examples

## Quick Reference Examples

### Navigation & Joins

```forge
// Get all friends of a person
person.friends

// Get friends of friends
person.friends.friends

// Get all people reachable via friends
person.^friends

// Get person and all reachable via friends  
person.*friends

// Reverse lookup: who has this person as a friend?
person.~friends
```

### Filtering with Quantifiers

```forge
// All adults
{p: Person | p.age >= 18}

// People with at least one friend
{p: Person | some p.friends}

// People with no enemies
{p: Person | no p.enemies}

// People with exactly one best friend
{p: Person | one p.bestFriend}
```

### Logical Predicates

```forge
// Everyone has a friend
all p: Person | some p.friends

// No one is their own friend
all p: Person | p not in p.friends

// Friendship is symmetric
all p, q: Person | p in q.friends implies q in p.friends

// At least two people know each other
some disj p, q: Person | p in q.friends and q in p.friends
```

### Set Operations

```forge
// Union: all people who are friends OR family
p.friends + p.family

// Intersection: people who are both friends AND coworkers
p.friends & p.coworkers

// Difference: friends who are not family
p.friends - p.family

// Cardinality: count friends
#p.friends

// Empty check
p.friends = none
```

### Numeric Operations

```forge
// Compare ages
p.age > q.age

// Arithmetic
add[p.age, 1]
subtract[p.age, q.age]

// Aggregates on sets
min[Person.age]
max[Person.age]
```

### Complex Examples

```forge
// Find all people who know someone older than them
{p: Person | some q: Person | q in p.friends and q.age > p.age}

// Check if graph is connected (all nodes reachable from any node)
all disj n1, n2: Node | n2 in n1.^edge or n1 in n2.^edge

// Find pairs where neither is reachable from the other
{n1, n2: Node | n2 not in n1.^edge and n1 not in n2.^edge}

// Check acyclicity
all n: Node | n not in n.^edge

// Functional relation check (each input maps to at most one output)
all x: Domain | lone x.relation

// Total relation check (every input has at least one output)
all x: Domain | some x.relation

// Bijection check
all x: Domain | one x.relation
all y: Range | one relation.y
```

### Implication Patterns

```forge
// If someone is a manager, they have direct reports
all p: Person | p.role = Manager implies some p.directReports

// If-then-else: managers get bonus, others don't
all p: Person | p.role = Manager implies p.bonus > 0 else p.bonus = 0
```

### Using Built-in Relations

```forge
// iden: identity pairs
Person & iden.Person   // same as just Person

// univ: all atoms
#univ   // total atom count

// Using iden for reflexive check
all p: Person | (p, p) in iden
```

### Label Access

```forge
// Get numeric label for comparison
@num:node > 5

// Get string label
@str:person = "Alice"

// Boolean label check  
@bool:flag = true
```
