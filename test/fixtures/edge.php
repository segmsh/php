<?php
namespace App\Lang;

# Escapes in single and double quotes
$MESS['single'] = 'It\'s a back\\slash and a literal \n here';
$MESS["double"] = "Tab\there, \"quoted\", dollar \$5 and \x41\u{1F600}";
$MESS["multiline"] = "First line
Second line";

// Interpolated variables become placeholders
$MESS["vars"] = "Hello $name, you have {$user->count} messages and ${total} total.";
$MESS['nested']['key'] = 'Nested key';
$MESS[42] = 'Numeric key';

/* Not translatable */
$MESS["concat"] = 'Part one ' . 'part two';
$MESS["call"] = GetMessage("OTHER");
$MESS["number"] = 3.14;
$MESS["placeholder"] = "%s";
$MESS["heredoc"] = <<<EOT
Heredoc text
EOT;
$other = strtoupper('not a message');

define('APP_TITLE', 'Application title');
define("APP_EMPTY", "");

$lang = array(
    'old' => 'Old style array',
    'list' => array('one', 'two'),
);

$MESS['dup'] = 'First';
$MESS['dup'] = 'Second';
?>
<p>Inline HTML after the closing tag is not a translation.</p>
