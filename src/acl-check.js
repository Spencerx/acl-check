// Access control logic

const $rdf = require('rdflib')

const ACL = $rdf.Namespace('http://www.w3.org/ns/auth/acl#')
const FOAF = $rdf.Namespace('http://xmlns.com/foaf/0.1/')
const VCARD = $rdf.Namespace('http://www.w3.org/2006/vcard/ns#')

module.exports = {}

function publisherTrustedApp (kb, doc, aclDoc, modesRequired, origin, docAuths) {
  let app = $rdf.sym(origin)
  let appAuths = docAuths.filter(auth => kb.holds(auth, ACL('mode'), ACL('Control'), aclDoc))
  let owners = appAuths.map(auth => kb.each(auth, ACL('agent'))).flat() //  owners
  let relevant = owners.map(owner => kb.each(owner, ACL('trust'), null, owner.doc()).filter(
    ta => kb.holds(ta, ACL('trustedApp'), app, owner.doc()))).flat() // ta's
  let modesOK = relevant.map(ta => kb.each(ta, ACL('mode'))).flat().map(m => m.uri)
  let modesRequiredURIs = modesRequired.map(m => m.uri)
  modesRequiredURIs.every(uri => modesOK.includes(uri))
  // modesRequired.every(mode => appAuths.some(auth => kb.holds(auth, ACL('mode'), mode, aclDoc)))
}

/* Function checkAccess
** @param kb A quadstore
** @param doc the resource (A named node) or directory for which ACL applies
*/
function checkAccess (kb, doc, directory, aclDoc, agent, modesRequired, origin, trustedOrigins) {
  let modeURIs = modesAllowed(kb, doc, directory, aclDoc, agent, origin, trustedOrigins)
  let ok = true
  console.log(`CheckAccess: modeURIs: ${modeURIs.size}`)
  modesRequired.forEach(mode => {
    console.log(` checking ` + mode)
    if (modeURIs.has(mode.uri)) {
      console.log('  Mode required and allowed:' + mode)
    } else if (mode.sameTerm(ACL('Append')) && modeURIs.has(ACL('Write').uri)) {
      console.log('  Append required and Write allowed. OK')
    } else {
      console.log('  MODE REQUIRED NOT ALLOWED:' + mode)
      ok = false
    }
  })
  return ok
}

function modesAllowed (kb, doc, directory, aclDoc, agent, modesRequired, origin, trustedOrigins) {
  console.log(`modesAllowed: checking access to ${doc} by ${agent}`)
  var auths
  if (!directory) { // Normal case, ACL for a file
    auths = kb.each(null, ACL('accessTo'), doc, aclDoc)
    console.log(`   ${auths.length} direct authentications about ${doc}`)
  } else {
    auths = kb.each(null, ACL('default'), directory, null)
    auths = auths.concat(kb.each(null, ACL('defaultForNew'), directory, null)) // Deprecated but keep for ages
    console.log(`   ${auths.length}  default authentications about ${directory} in ${aclDoc}`)
  }
  if (origin && trustedOrigins && trustedOrigins.includes(origin)) {
    console.log('Origin ' + origin + ' is trusted')
    origin = null // stop worrying about origin
    console.log(`  modesAllowed: Origin ${origin} is trusted.`)
  }
  function agentOrGroupOK (auth, agent) {
    console.log(`   Checking auth ${auth} with agent ${agent}`)
    if (kb.holds(auth, ACL('agentClass'), FOAF('Agent'), aclDoc)) {
      console.log(`    Agent or group: Ok, its public.`)
      return true
    }
    if (!agent) {
      console.log(`    Agent or group: Fail: not public and not logged on.`)
      return false
    }
    if (kb.holds(auth, ACL('agentClass'), ACL('AuthenticatedAgent'), aclDoc)) {
      console.log('    AuthenticatedAgent: logged in, looks good')
      return true
    }
    if (kb.holds(auth, ACL('agent'), agent, aclDoc)) {
      console.log('    Agent explicitly authenticated.')
      return true
    }
    if (kb.each(auth, ACL('accessToGroup'), null, aclDoc).some(
      group => kb.holds(agent, VCARD('member'), group, group.doc()))) {
      console.log('    Agent is member of group which has accees.')
      return true
    }
    console.log('    Agent or group access fails for this authentication.')
    return false
  } // Agent or group

  function originOK (auth, origin) {
    return kb.holds(auth, ACL('origin'), origin, aclDoc)
  }

  function agentAndAppOK (auth) {
    if (!agentOrGroupOK(auth, agent)) {
      console.log('     The agent/group/public check fails')
      return false
    }
    if (!origin) {
      console.log('     Origin check not needed: no origin.')
      return true
    }
    if (originOK(auth, origin)) {
      console.log('     Origin check succeeded.')
      return true
    }
    console.log('     Origin check FAILED. Origin not trusted.')
    return false // @@ look for other trusted apps
  }

  auths = auths.filter(agentAndAppOK)
  console.log('  auths with good who and what: ' + auths.length)
  var modeURIs = new Set()
  auths.forEach(auth => {
    let modes = kb.each(auth, ACL('mode'), null, aclDoc)
    modes.forEach(mode => {
      console.log('      Mode allowed: ' + mode)
      modeURIs.add(mode.uri)
    })
  })
  return modeURIs
}

module.exports.checkAccess = checkAccess
module.exports.modesAllowed = modesAllowed
module.exports.publisherTrustedApp = publisherTrustedApp
